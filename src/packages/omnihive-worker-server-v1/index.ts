/// <reference path="../../types/globals.omnihive.d.ts" />

import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { OmniHiveLogLevel } from "@withonevision/omnihive-core/enums/OmniHiveLogLevel";
import { RegisteredHiveWorkerSection } from "@withonevision/omnihive-core/enums/RegisteredHiveWorkerSection";
import { RegisteredUrlType } from "@withonevision/omnihive-core/enums/RegisteredUrlType";
import { ServerStatus } from "@withonevision/omnihive-core/enums/ServerStatus";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";
import { ObjectHelper } from "@withonevision/omnihive-core/helpers/ObjectHelper";
import { StringBuilder } from "@withonevision/omnihive-core/helpers/StringBuilder";
import { IDatabaseWorker } from "@withonevision/omnihive-core/interfaces/IDatabaseWorker";
import { IGraphBuildWorker } from "@withonevision/omnihive-core/interfaces/IGraphBuildWorker";
import { ILogWorker } from "@withonevision/omnihive-core/interfaces/ILogWorker";
import { IRestEndpointWorker } from "@withonevision/omnihive-core/interfaces/IRestEndpointWorker";
import { IServerWorker } from "@withonevision/omnihive-core/interfaces/IServerWorker";
import { ConnectionSchema } from "@withonevision/omnihive-core/models/ConnectionSchema";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import { HiveWorkerMetadataDatabase } from "@withonevision/omnihive-core/models/HiveWorkerMetadataDatabase";
import { HiveWorkerMetadataGraphBuilder } from "@withonevision/omnihive-core/models/HiveWorkerMetadataGraphBuilder";
import { HiveWorkerMetadataRestFunction } from "@withonevision/omnihive-core/models/HiveWorkerMetadataRestFunction";
import { HiveWorkerMetadataServer } from "@withonevision/omnihive-core/models/HiveWorkerMetadataServer";
import { RegisteredHiveWorker } from "@withonevision/omnihive-core/models/RegisteredHiveWorker";
import { RestEndpointExecuteResponse } from "@withonevision/omnihive-core/models/RestEndpointExecuteResponse";
import { TableSchema } from "@withonevision/omnihive-core/models/TableSchema";
import { ApolloServer, ApolloServerExpressConfig, mergeSchemas } from "apollo-server-express";
import { camelCase } from "change-case";
import { transformSync } from "esbuild";
import express from "express";
import Module from "module";
import { nanoid } from "nanoid";
import { serializeError } from "serialize-error";
import swaggerUi from "swagger-ui-express";
import { runInNewContext } from "vm";

type BuilderDatabaseWorker = {
    registeredWorker: RegisteredHiveWorker;
    builderName: string;
};

export default class CoreServerWorker extends HiveWorkerBase implements IServerWorker {
    private typedMetadata!: HiveWorkerMetadataServer;

    private webRootUrl = global.omnihive.getEnvironmentVariable<string>("OH_WEB_ROOT_URL");
    private graphIntrospection =
        global.omnihive.getEnvironmentVariable<boolean>("OH_CORE_GRAPH_INTROSPECTION") ?? false;
    private graphTracing = global.omnihive.getEnvironmentVariable<boolean>("OH_CORE_GRAPH_TRACING") ?? false;
    private graphPlayground = global.omnihive.getEnvironmentVariable<boolean>("OH_CORE_GRAPH_PLAYGROUND") ?? true;
    private swagger = global.omnihive.getEnvironmentVariable<boolean>("OH_CORE_SWAGGER");

    constructor() {
        super();
    }

    public async init(name: string, metadata?: any): Promise<void> {
        await AwaitHelper.execute(super.init(name, metadata));

        try {
            this.typedMetadata = this.checkObjectStructure<HiveWorkerMetadataServer>(
                HiveWorkerMetadataServer,
                metadata
            );
        } catch (err) {
            throw new Error("Server Init Error => " + JSON.stringify(serializeError(err)));
        }
    }

    public buildServer = async (app: express.Express): Promise<express.Express> => {
        if (IsHelper.isNullOrUndefinedOrEmptyStringOrWhitespace(this.webRootUrl)) {
            throw new Error("OH_WEB_ROOT_URL is not defined");
        }

        const logWorker: ILogWorker | undefined = this.getWorker<ILogWorker | undefined>(HiveWorkerType.Log);

        try {
            logWorker?.write(OmniHiveLogLevel.Info, `Graph Connection Schemas Being Loaded`);

            // Get build workers
            const buildWorkers: RegisteredHiveWorker[] = [];

            this.registeredWorkers.forEach((worker: RegisteredHiveWorker) => {
                if (
                    worker.type === HiveWorkerType.GraphBuilder &&
                    (this.typedMetadata.buildWorkers.includes("*") ||
                        this.typedMetadata.buildWorkers.includes(worker.name))
                ) {
                    buildWorkers.push(worker);
                }
            });

            // Get db workers
            const dbWorkers: BuilderDatabaseWorker[] = [];

            buildWorkers.forEach((worker: RegisteredHiveWorker) => {
                const buildWorkerMetadata: HiveWorkerMetadataGraphBuilder =
                    worker.metadata as HiveWorkerMetadataGraphBuilder;

                if (buildWorkerMetadata.dbWorkers.includes("*")) {
                    this.registeredWorkers
                        .filter((worker: RegisteredHiveWorker) => worker.type === HiveWorkerType.Database)
                        .forEach((dbWorker: RegisteredHiveWorker) => {
                            dbWorkers.push({ registeredWorker: dbWorker, builderName: worker.name });
                        });
                } else {
                    buildWorkerMetadata.dbWorkers.forEach((value: string) => {
                        const dbWorker: RegisteredHiveWorker | undefined = this.registeredWorkers.find(
                            (worker: RegisteredHiveWorker) =>
                                worker.name === value && worker.type === HiveWorkerType.Database
                        );
                        if (!IsHelper.isNullOrUndefined(dbWorker)) {
                            dbWorkers.push({ registeredWorker: dbWorker, builderName: worker.name });
                        }
                    });
                }
            });

            // Write database schemas

            for (const worker of dbWorkers) {
                logWorker?.write(OmniHiveLogLevel.Info, `Retrieving ${worker.registeredWorker.name} Schema`);

                const dbWorkerMeta = worker.registeredWorker.metadata as HiveWorkerMetadataDatabase;
                const result: ConnectionSchema = await AwaitHelper.execute(
                    (worker.registeredWorker.instance as IDatabaseWorker).getSchema()
                );

                result.tables.forEach((schema: TableSchema) => {
                    if (dbWorkerMeta.ignoreSchema) {
                        schema.tableNameCamelCase = camelCase(schema.tableName);
                        schema.tableNamePascalCase = this.capitalizeFirstLetter(camelCase(schema.tableName));
                    } else {
                        schema.tableNameCamelCase = `${schema.schemaName.toLowerCase()}${this.capitalizeFirstLetter(
                            camelCase(schema.tableName)
                        )}`;
                        schema.tableNamePascalCase = `${this.capitalizeFirstLetter(
                            schema.schemaName.toLowerCase()
                        )}${this.capitalizeFirstLetter(camelCase(schema.tableName))}`;
                    }

                    if (schema.columnIsForeignKey) {
                        if (dbWorkerMeta.ignoreSchema) {
                            schema.columnForeignKeyTableNameCamelCase = camelCase(schema.columnForeignKeyTableName);
                            schema.columnForeignKeyTableNamePascalCase = this.capitalizeFirstLetter(
                                camelCase(schema.columnForeignKeyTableName)
                            );
                        } else {
                            schema.columnForeignKeyTableNameCamelCase = `${schema.schemaName.toLowerCase()}${this.capitalizeFirstLetter(
                                camelCase(schema.columnForeignKeyTableName)
                            )}`;
                            schema.columnForeignKeyTableNamePascalCase = `${this.capitalizeFirstLetter(
                                camelCase(schema.schemaName)
                            )}${this.capitalizeFirstLetter(camelCase(schema.columnForeignKeyTableName))}`;
                        }
                    }

                    let columnWorkingName = camelCase(schema.columnNameDatabase);

                    columnWorkingName = columnWorkingName.replace(/[^a-zA-Z0-9 ]+/g, "");
                    columnWorkingName = columnWorkingName.replace(/ /g, "_");
                    columnWorkingName = columnWorkingName.charAt(0).toLowerCase() + columnWorkingName.slice(1);

                    if (IsHelper.isNumber(schema.columnNameDatabase.substring(0, 1))) {
                        columnWorkingName = "_N_" + columnWorkingName;
                    }

                    if (schema.columnNameDatabase.substring(0, 3) === "___") {
                        columnWorkingName = "_3_" + columnWorkingName;
                    } else if (schema.columnNameDatabase.substring(0, 2) === "__") {
                        columnWorkingName = "_2_" + columnWorkingName;
                    } else if (schema.columnNameDatabase.substring(0, 1) === "_") {
                        columnWorkingName = "_1_" + columnWorkingName;
                    }

                    schema.columnNameEntity = columnWorkingName.toString();
                });

                global.omnihive.registeredSchemas.push({
                    workerName: worker.registeredWorker.name,
                    tables: result.tables,
                    procFunctions: result.procFunctions,
                });
            }

            logWorker?.write(OmniHiveLogLevel.Info, `Graph Connection Schemas Completed`);
            logWorker?.write(OmniHiveLogLevel.Info, `Writing Graph Generation Files`);

            // Get all build workers and write out their graph schema
            const dbWorkerModules: { workerName: string; dbModule: any }[] = [];

            for (const builder of buildWorkers) {
                const buildWorker: IGraphBuildWorker = builder.instance as IGraphBuildWorker;

                for (const dbWorker of dbWorkers.filter(
                    (worker: BuilderDatabaseWorker) => worker.builderName === buildWorker.name
                )) {
                    const databaseWorker: IDatabaseWorker = dbWorker.registeredWorker.instance as IDatabaseWorker;
                    const schema: ConnectionSchema | undefined = global.omnihive.registeredSchemas.find(
                        (value: ConnectionSchema) => value.workerName === dbWorker.registeredWorker.name
                    );

                    const graphWorkerReturn = buildWorker.buildDatabaseWorkerSchema(databaseWorker, schema);
                    let dbWorkerModule = undefined;

                    if (typeof graphWorkerReturn === "string") {
                        dbWorkerModule = this.importFromString(graphWorkerReturn);
                    } else {
                        dbWorkerModule = {
                            FederatedGraphQuerySchema: graphWorkerReturn,
                        };
                    }

                    dbWorkerModules.push({ workerName: dbWorker.registeredWorker.name, dbModule: dbWorkerModule });
                }
            }

            // Build custom graph workers
            let graphEndpointModule: any | undefined = undefined;

            const customGraphWorkers: RegisteredHiveWorker[] = this.registeredWorkers.filter(
                (worker: RegisteredHiveWorker) => worker.type === HiveWorkerType.GraphEndpointFunction
            );
            if (!IsHelper.isEmptyArray(customGraphWorkers)) {
                const builder: StringBuilder = new StringBuilder();

                // Build imports
                builder.appendLine(
                    `var { GraphQLInt, GraphQLSchema, GraphQLString, GraphQLBoolean, GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLInputObjectType } = require("graphql");`
                );
                builder.appendLine(
                    `var { GraphQLJSONObject } = require("@withonevision/omnihive-core/models/GraphQLJSON");`
                );
                builder.appendLine(
                    `var { AwaitHelper } = require("@withonevision/omnihive-core/helpers/AwaitHelper");`
                );
                builder.appendLine(
                    `var { HiveWorkerType } = require("@withonevision/omnihive-core/enums/HiveWorkerType");`
                );
                builder.appendLine(
                    `var { CustomGraphHelper } = require("@withonevision/omnihive-worker-server-v1/helpers/CustomGraphHelper");`
                );
                builder.appendLine();

                // Build main graph schema
                builder.appendLine(`exports.FederatedCustomFunctionQuerySchema = new GraphQLSchema({`);

                // Query Object Type
                builder.appendLine(`\tquery: new GraphQLObjectType({`);
                builder.appendLine(`\t\tname: 'Query',`);
                builder.appendLine(`\t\tfields: () => ({`);

                // Loop through graph endpoints

                customGraphWorkers.forEach((worker: RegisteredHiveWorker) => {
                    builder.appendLine(`\t\t\t${worker.name}: {`);
                    builder.appendLine(`\t\t\t\ttype: GraphQLJSONObject,`);
                    builder.appendLine(`\t\t\t\targs: {`);
                    builder.appendLine(`\t\t\t\t\tcustomArgs: { type: GraphQLJSONObject },`);
                    builder.appendLine(`\t\t\t\t},`);
                    builder.appendLine(`\t\t\t\tresolve: async (parent, args, context, resolveInfo) => {`);
                    builder.appendLine(`\t\t\t\t\tvar graphHelper = new CustomGraphHelper();`);
                    builder.appendLine(
                        `\t\t\t\t\tvar customFunctionReturn = await AwaitHelper.execute(graphHelper.parseCustomGraph("${worker.name}", args.customArgs, context.omnihive));`
                    );
                    builder.appendLine(`\t\t\t\t\treturn customFunctionReturn;`);
                    builder.appendLine(`\t\t\t\t},`);
                    builder.appendLine(`\t\t\t},`);
                });

                builder.appendLine(`\t\t})`);
                builder.appendLine(`\t}),`);
                builder.appendLine(`});`);

                graphEndpointModule = this.importFromString(builder.outputString());
            }

            logWorker?.write(OmniHiveLogLevel.Info, `Graph Generation Files Completed`);
            logWorker?.write(OmniHiveLogLevel.Info, `Graph Schema Build Completed Successfully`);
            logWorker?.write(OmniHiveLogLevel.Info, `Booting Up Graph Server`);

            // Register graph builder databases
            logWorker?.write(OmniHiveLogLevel.Info, `Graph Progress => Database Graph Endpoint Registering`);

            for (const builder of buildWorkers) {
                const builderMeta = builder.metadata as HiveWorkerMetadataGraphBuilder;

                const builderDbWorkers = dbWorkers.filter(
                    (worker: BuilderDatabaseWorker) => builder.name === worker.builderName
                );

                if (!IsHelper.isEmptyArray(builderDbWorkers)) {
                    for (const databaseWorker of builderDbWorkers) {
                        const dbWorkerMeta = databaseWorker.registeredWorker.metadata as HiveWorkerMetadataDatabase;
                        let graphDatabaseSchema: any;

                        const databaseDynamicModule: any = dbWorkerModules.filter(
                            (value) => value.workerName === databaseWorker.registeredWorker.name
                        )[0].dbModule;
                        const databaseQuerySchema: any = databaseDynamicModule.FederatedGraphQuerySchema;

                        // eslint-disable-next-line prefer-const
                        graphDatabaseSchema = databaseQuerySchema;

                        logWorker?.write(
                            OmniHiveLogLevel.Info,
                            `Graph Progress => ${builder.name} => ${databaseWorker.registeredWorker.name} Query Schema Merged`
                        );

                        const procSchema: any = databaseDynamicModule.FederatedGraphProcSchema;

                        if (!IsHelper.isNullOrUndefined(procSchema)) {
                            graphDatabaseSchema = mergeSchemas({ schemas: [graphDatabaseSchema, procSchema] });
                        }

                        logWorker?.write(
                            OmniHiveLogLevel.Info,
                            `Graph Progress => ${builder.name} => ${databaseWorker.registeredWorker.name} Proc Schema Merged`
                        );

                        const graphDatabaseConfig: ApolloServerExpressConfig = {
                            introspection: this.graphIntrospection,
                            tracing: this.graphTracing,
                            schema: graphDatabaseSchema,
                            context: async ({ req }) => {
                                const omnihive = {
                                    access: req.headers["x-omnihive-access"] || ``,
                                    auth: req.headers.authorization || ``,
                                    cache: req.headers["x-omnihive-cache-type"] || ``,
                                    cacheSeconds: req.headers["x-omnihive-cache-seconds"],
                                };
                                return { omnihive };
                            },
                        };

                        if (this.graphPlayground) {
                            graphDatabaseConfig.playground = {
                                endpoint: `${this.webRootUrl}/${this.typedMetadata.urlRoute}/${builderMeta.urlRoute}/${dbWorkerMeta.urlRoute}`,
                            };
                        } else {
                            graphDatabaseConfig.playground = false;
                        }

                        const graphDatabaseServer: ApolloServer = new ApolloServer(graphDatabaseConfig);
                        graphDatabaseServer.applyMiddleware({
                            app,
                            path: `/${this.typedMetadata.urlRoute}/${builderMeta.urlRoute}/${dbWorkerMeta.urlRoute}`,
                        });

                        global.omnihive.registeredUrls.push({
                            path: `${this.webRootUrl}/${this.typedMetadata.urlRoute}/${builderMeta.urlRoute}/${dbWorkerMeta.urlRoute}`,
                            type: RegisteredUrlType.GraphDatabase,
                            metadata: {},
                        });
                    }
                }
            }

            logWorker?.write(OmniHiveLogLevel.Info, `Graph Progress => Database Graph Endpoint Registered`);

            // Register custom graph apollo server
            logWorker?.write(OmniHiveLogLevel.Info, `Graph Progress => Custom Functions Graph Endpoint Registering`);

            if (
                this.registeredWorkers.some(
                    (worker: RegisteredHiveWorker) => worker.type === HiveWorkerType.GraphEndpointFunction
                ) &&
                !IsHelper.isNullOrUndefined(graphEndpointModule)
            ) {
                const functionDynamicModule: any = graphEndpointModule;
                const graphFunctionSchema: any = functionDynamicModule.FederatedCustomFunctionQuerySchema;

                const graphFunctionConfig: ApolloServerExpressConfig = {
                    introspection: this.graphIntrospection,
                    tracing: this.graphTracing,
                    schema: graphFunctionSchema,
                    context: async ({ req }) => {
                        const omnihive = {
                            access: req.headers["x-omnihive-access"] || ``,
                            auth: req.headers.authorization || ``,
                            cache: req.headers["x-omnihive-cache-type"] || ``,
                            cacheSeconds: req.headers["x-omnihive-cache-seconds"],
                        };
                        return { omnihive };
                    },
                };

                if (this.graphPlayground) {
                    graphFunctionConfig.playground = {
                        endpoint: `${this.webRootUrl}/${this.typedMetadata.urlRoute}/custom/graphql`,
                    };
                } else {
                    graphFunctionConfig.playground = false;
                }

                const graphFunctionServer: ApolloServer = new ApolloServer(graphFunctionConfig);
                graphFunctionServer.applyMiddleware({
                    app,
                    path: `/${this.typedMetadata.urlRoute}/custom/graphql`,
                });

                global.omnihive.registeredUrls.push({
                    path: `${this.webRootUrl}/${this.typedMetadata.urlRoute}/custom/graphql`,
                    type: RegisteredUrlType.GraphFunction,
                    metadata: {},
                });
            }

            logWorker?.write(OmniHiveLogLevel.Info, `Graph Progress => Custom Functions Endpoint Registered`);
            logWorker?.write(OmniHiveLogLevel.Info, `REST Server Generation Started`);

            // Register "custom" REST endpoints
            if (
                this.registeredWorkers.some(
                    (worker: RegisteredHiveWorker) => worker.type === HiveWorkerType.RestEndpointFunction
                )
            ) {
                const swaggerDefinition: swaggerUi.JsonObject = {
                    info: {
                        title: "OmniHive Custom Function REST Interface",
                        version: "1.0.0",
                        description:
                            "All custom REST endpoint functions written by the OmniHive account administrators",
                    },
                    license: {},
                    openapi: "3.0.0",
                    servers: [
                        {
                            url: `${this.webRootUrl}/${this.typedMetadata.urlRoute}/custom/rest`,
                        },
                    ],
                };

                const restWorkers = this.registeredWorkers.filter(
                    (rw: RegisteredHiveWorker) =>
                        rw.type === HiveWorkerType.RestEndpointFunction &&
                        rw.section === RegisteredHiveWorkerSection.User
                );

                restWorkers.forEach((rw: RegisteredHiveWorker) => {
                    let workerMetaData: HiveWorkerMetadataRestFunction;

                    try {
                        workerMetaData = ObjectHelper.createStrict<HiveWorkerMetadataRestFunction>(
                            HiveWorkerMetadataRestFunction,
                            rw.metadata
                        );
                    } catch (e) {
                        logWorker?.write(
                            OmniHiveLogLevel.Error,
                            `Cannot register custom REST worker ${rw.name}.  MetaData is incorrect.`
                        );

                        return;
                    }

                    const workerInstance: IRestEndpointWorker = rw.instance as IRestEndpointWorker;

                    app[workerMetaData.restMethod](
                        `/${this.typedMetadata.urlRoute}/custom/rest/${workerMetaData.urlRoute}`,
                        async (req: express.Request, res: express.Response) => {
                            res.setHeader("Content-Type", "application/json");

                            try {
                                const workerResponse: RestEndpointExecuteResponse = await AwaitHelper.execute(
                                    workerInstance.execute(
                                        req.headers,
                                        `${req.protocol}://${req.get("host")}${req.originalUrl}`,
                                        req.body
                                    )
                                );

                                if (!IsHelper.isNullOrUndefined(workerResponse.response)) {
                                    res.status(workerResponse.status).json(workerResponse.response);
                                } else {
                                    res.status(workerResponse.status).send(true);
                                }
                            } catch (e) {
                                return res.status(500).render("500", {
                                    rootUrl: this.webRootUrl,
                                    error: serializeError(e),
                                });
                            }
                        }
                    );

                    global.omnihive.registeredUrls.push({
                        path: `${this.webRootUrl}/${this.typedMetadata.urlRoute}/custom/rest/${workerMetaData.urlRoute}`,
                        type: RegisteredUrlType.RestFunction,
                        metadata: {},
                    });

                    const workerSwagger: swaggerUi.JsonObject | undefined = workerInstance.getSwaggerDefinition();

                    if (!IsHelper.isNullOrUndefined(workerSwagger)) {
                        swaggerDefinition.paths = { ...swaggerDefinition.paths, ...workerSwagger.paths };
                        swaggerDefinition.definitions = {
                            ...swaggerDefinition.definitions,
                            ...workerSwagger.definitions,
                        };
                    }
                });

                if (this.swagger && !IsHelper.isEmptyArray(restWorkers)) {
                    app.get(
                        `/${this.typedMetadata.urlRoute}/custom/rest/api-docs/swagger.json`,
                        async (_req: express.Request, res: express.Response) => {
                            res.setHeader("Content-Type", "application/json");
                            return res.status(200).json(swaggerDefinition);
                        }
                    );

                    app.use(
                        `/${this.typedMetadata.urlRoute}/custom/rest/api-docs`,
                        swaggerUi.serve,
                        swaggerUi.setup(swaggerDefinition)
                    );

                    global.omnihive.registeredUrls.push({
                        path: `${this.webRootUrl}/${this.typedMetadata.urlRoute}/custom/rest/api-docs`,
                        type: RegisteredUrlType.Swagger,
                        metadata: {
                            swaggerJsonUrl: `${this.webRootUrl}/${this.typedMetadata.urlRoute}/custom/rest/api-docs/swagger.json`,
                        },
                    });
                }
            }

            logWorker?.write(OmniHiveLogLevel.Info, `REST Server Generation Completed`);
            global.omnihive.serverStatus = ServerStatus.Online;
            logWorker?.write(OmniHiveLogLevel.Info, `New Server Built`);

            // Return app
            return app;
        } catch (err) {
            logWorker?.write(OmniHiveLogLevel.Error, `Server Spin-Up Error => ${JSON.stringify(serializeError(err))}`);
            throw new Error(err);
        }
    };

    private capitalizeFirstLetter(value: string) {
        return value.charAt(0).toUpperCase() + value.slice(1);
    }

    private importFromString = (code: string): any => {
        const transformResult = transformSync(code, { format: "cjs" });
        const contextModule = new Module(nanoid());

        runInNewContext(transformResult.code, {
            exports: contextModule.exports,
            module: contextModule,
            require,
        });

        return contextModule.exports;
    };
}
