/// <reference path="../../types/globals.omnihive.d.ts" />

import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { OmniHiveLogLevel } from "@withonevision/omnihive-core/enums/OmniHiveLogLevel";
import { RegisteredUrlType } from "@withonevision/omnihive-core/enums/RegisteredUrlType";
import { ServerStatus } from "@withonevision/omnihive-core/enums/ServerStatus";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { ObjectHelper } from "@withonevision/omnihive-core/helpers/ObjectHelper";
import { StringBuilder } from "@withonevision/omnihive-core/helpers/StringBuilder";
import { StringHelper } from "@withonevision/omnihive-core/helpers/StringHelper";
import { IDatabaseWorker } from "@withonevision/omnihive-core/interfaces/IDatabaseWorker";
import { IFeatureWorker } from "@withonevision/omnihive-core/interfaces/IFeatureWorker";
import { IGraphBuildWorker } from "@withonevision/omnihive-core/interfaces/IGraphBuildWorker";
import { ILogWorker } from "@withonevision/omnihive-core/interfaces/ILogWorker";
import { IRestEndpointWorker } from "@withonevision/omnihive-core/interfaces/IRestEndpointWorker";
import { IServerWorker } from "@withonevision/omnihive-core/interfaces/IServerWorker";
import { ConnectionSchema } from "@withonevision/omnihive-core/models/ConnectionSchema";
import { HiveWorker } from "@withonevision/omnihive-core/models/HiveWorker";
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
import express from "express";
import requireFromString from "require-from-string";
import { serializeError } from "serialize-error";
import swaggerUi from "swagger-ui-express";

type BuilderDatabaseWorker = {
    registeredWorker: RegisteredHiveWorker;
    builderName: string;
};

export default class CoreServerWorker extends HiveWorkerBase implements IServerWorker {
    private metadata!: HiveWorkerMetadataServer;

    constructor() {
        super();
    }

    public async init(config: HiveWorker): Promise<void> {
        await AwaitHelper.execute<void>(super.init(config));

        try {
            this.metadata = this.checkObjectStructure<HiveWorkerMetadataServer>(
                HiveWorkerMetadataServer,
                config.metadata
            );
        } catch (err) {
            throw new Error("Server Init Error => " + JSON.stringify(serializeError(err)));
        }
    }

    public buildServer = async (app: express.Express): Promise<express.Express> => {
        const featureWorker: IFeatureWorker | undefined = this.getWorker<IFeatureWorker>(HiveWorkerType.Feature);
        const logWorker: ILogWorker | undefined = this.getWorker<ILogWorker | undefined>(HiveWorkerType.Log);

        try {
            logWorker?.write(OmniHiveLogLevel.Info, `Graph Connection Schemas Being Loaded`);

            // Get build workers
            const buildWorkers: RegisteredHiveWorker[] = [];

            this.registeredWorkers.forEach((worker: RegisteredHiveWorker) => {
                if (
                    worker.type === HiveWorkerType.GraphBuilder &&
                    worker.enabled &&
                    (this.metadata.buildWorkers.includes("*") || this.metadata.buildWorkers.includes(worker.name))
                ) {
                    buildWorkers.push(worker);
                }
            });

            // Get db workers
            const dbWorkers: BuilderDatabaseWorker[] = [];

            buildWorkers.forEach((worker: RegisteredHiveWorker) => {
                const buildWorkerMetadata: HiveWorkerMetadataGraphBuilder = worker.metadata as HiveWorkerMetadataGraphBuilder;

                if (buildWorkerMetadata.dbWorkers.includes("*")) {
                    this.registeredWorkers
                        .filter(
                            (worker: RegisteredHiveWorker) =>
                                worker.type === HiveWorkerType.Database && worker.enabled === true
                        )
                        .forEach((dbWorker: RegisteredHiveWorker) => {
                            dbWorkers.push({ registeredWorker: dbWorker, builderName: worker.name });
                        });
                } else {
                    buildWorkerMetadata.dbWorkers.forEach((value: string) => {
                        const dbWorker: RegisteredHiveWorker | undefined = this.registeredWorkers.find(
                            (worker: RegisteredHiveWorker) =>
                                worker.name === value &&
                                worker.type === HiveWorkerType.Database &&
                                worker.enabled === true
                        );
                        if (dbWorker) {
                            dbWorkers.push({ registeredWorker: dbWorker, builderName: worker.name });
                        }
                    });
                }
            });

            // Write database schemas

            for (const worker of dbWorkers) {
                logWorker?.write(OmniHiveLogLevel.Info, `Retrieving ${worker.registeredWorker.name} Schema`);

                const result: ConnectionSchema = await AwaitHelper.execute<ConnectionSchema>(
                    (worker.registeredWorker.instance as IDatabaseWorker).getSchema()
                );

                result.tables.forEach((schema: TableSchema) => {
                    schema.tableNameCamelCase = camelCase(schema.tableName);
                    schema.tableNamePascalCase = StringHelper.capitalizeFirstLetter(camelCase(schema.tableName));

                    if (schema.columnIsForeignKey) {
                        schema.columnForeignKeyTableNameCamelCase = camelCase(schema.columnForeignKeyTableName);
                        schema.columnForeignKeyTableNamePascalCase = StringHelper.capitalizeFirstLetter(
                            camelCase(schema.columnForeignKeyTableName)
                        );
                    }

                    let columnWorkingName = camelCase(schema.columnNameDatabase);

                    columnWorkingName = columnWorkingName.replace(/[^a-zA-Z0-9 ]+/g, "");
                    columnWorkingName = columnWorkingName.replace(/ /g, "_");
                    columnWorkingName = columnWorkingName.charAt(0).toLowerCase() + columnWorkingName.slice(1);

                    if (!isNaN(parseInt(schema.columnNameDatabase.substring(0, 1), 10))) {
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
                    storedProcs: result.storedProcs,
                });
            }

            logWorker?.write(OmniHiveLogLevel.Info, `Graph Connection Schemas Completed`);
            logWorker?.write(OmniHiveLogLevel.Info, `Writing Graph Generation Files`);

            // Get all build workers and write out their graph schema
            const dbWorkerModules: { workerName: string; dbModule: any }[] = [];

            for (const builder of buildWorkers) {
                const buildWorker: IGraphBuildWorker = builder.instance as IGraphBuildWorker;

                for (const dbWorker of dbWorkers.filter(
                    (worker: BuilderDatabaseWorker) => worker.builderName === buildWorker.config.name
                )) {
                    const databaseWorker: IDatabaseWorker = dbWorker.registeredWorker.instance as IDatabaseWorker;
                    const schema: ConnectionSchema | undefined = global.omnihive.registeredSchemas.find(
                        (value: ConnectionSchema) => value.workerName === dbWorker.registeredWorker.name
                    );

                    const fileString = buildWorker.buildDatabaseWorkerSchema(databaseWorker, schema);
                    const dbWorkerModule = requireFromString(fileString);
                    dbWorkerModules.push({ workerName: dbWorker.registeredWorker.name, dbModule: dbWorkerModule });
                }
            }

            // Build custom graph workers
            let graphEndpointModule: any | undefined = undefined;

            const customGraphWorkers: RegisteredHiveWorker[] = this.registeredWorkers.filter(
                (worker: RegisteredHiveWorker) =>
                    worker.type === HiveWorkerType.GraphEndpointFunction && worker.enabled === true
            );
            if (customGraphWorkers.length > 0) {
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
                builder.appendLine();

                customGraphWorkers.forEach((worker: RegisteredHiveWorker) => {
                    builder.appendLine(`var ${worker.name} = require("${worker.importPath}");`);
                });

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
                    builder.appendLine(
                        `\t\t\t\t\tvar customFunctionInstance = global.omnihive.registeredWorkers.find((worker) => worker.name === "${worker.name}").instance;`
                    );
                    builder.appendLine(
                        `\t\t\t\t\tvar customFunctionReturn = await AwaitHelper.execute(customFunctionInstance.execute(args.customArgs));`
                    );
                    builder.appendLine(`\t\t\t\t\treturn customFunctionReturn;`);
                    builder.appendLine(`\t\t\t\t},`);
                    builder.appendLine(`\t\t\t},`);
                });

                builder.appendLine(`\t\t})`);
                builder.appendLine(`\t}),`);
                builder.appendLine(`});`);

                graphEndpointModule = requireFromString(builder.outputString());
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

                if (builderDbWorkers.length > 0) {
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

                        const procSchema: any = databaseDynamicModule.FederatedGraphStoredProcSchema;

                        if (procSchema) {
                            graphDatabaseSchema = mergeSchemas({ schemas: [graphDatabaseSchema, procSchema] });
                        }

                        logWorker?.write(
                            OmniHiveLogLevel.Info,
                            `Graph Progress => ${builder.name} => ${databaseWorker.registeredWorker.name} Stored Proc Schema Merged`
                        );

                        const graphDatabaseConfig: ApolloServerExpressConfig = {
                            schema: graphDatabaseSchema,
                            tracing: (await featureWorker?.get<boolean>("graphTracing")) ?? true,
                            introspection: (await featureWorker?.get<boolean>("graphIntrospection")) ?? true,
                            context: async ({ req }) => {
                                const omnihive = {
                                    access: req.headers.ohaccess || ``,
                                    auth: req.headers.authorization || ``,
                                    cache: req.headers.ohcache || ``,
                                    cacheSeconds: req.headers.ohcacheseconds,
                                };
                                return { omnihive };
                            },
                        };

                        if ((await featureWorker?.get<boolean>("graphPlayground")) ?? true) {
                            graphDatabaseConfig.playground = {
                                endpoint: `${global.omnihive.serverSettings.config.webRootUrl}/${this.metadata.urlRoute}/${builderMeta.urlRoute}/${dbWorkerMeta.urlRoute}`,
                            };
                        } else {
                            graphDatabaseConfig.playground = false;
                        }

                        const graphDatabaseServer: ApolloServer = new ApolloServer(graphDatabaseConfig);
                        graphDatabaseServer.applyMiddleware({
                            app,
                            path: `/${this.metadata.urlRoute}/${builderMeta.urlRoute}/${dbWorkerMeta.urlRoute}`,
                        });

                        global.omnihive.registeredUrls.push({
                            path: `${global.omnihive.serverSettings.config.webRootUrl}/${this.metadata.urlRoute}/${builderMeta.urlRoute}/${dbWorkerMeta.urlRoute}`,
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
                    (worker: RegisteredHiveWorker) =>
                        worker.type === HiveWorkerType.GraphEndpointFunction && worker.enabled === true
                ) &&
                graphEndpointModule
            ) {
                const functionDynamicModule: any = graphEndpointModule;
                const graphFunctionSchema: any = functionDynamicModule.FederatedCustomFunctionQuerySchema;

                const graphFunctionConfig: ApolloServerExpressConfig = {
                    schema: graphFunctionSchema,
                    tracing: (await featureWorker?.get<boolean>("graphTracing")) ?? true,
                    introspection: (await featureWorker?.get<boolean>("graphIntrospection")) ?? true,
                    context: async ({ req }) => {
                        const omnihive = {
                            access: req.headers.ohaccess || ``,
                            auth: req.headers.authorization || ``,
                            cache: req.headers.ohcache || ``,
                            cacheSeconds: req.headers.ohcacheseconds,
                        };
                        return { omnihive };
                    },
                };

                if ((await featureWorker?.get<boolean>("graphPlayground")) ?? true) {
                    graphFunctionConfig.playground = {
                        endpoint: `${global.omnihive.serverSettings.config.webRootUrl}/${this.metadata.urlRoute}/custom/graphql`,
                    };
                } else {
                    graphFunctionConfig.playground = false;
                }

                const graphFunctionServer: ApolloServer = new ApolloServer(graphFunctionConfig);
                graphFunctionServer.applyMiddleware({
                    app,
                    path: `/${this.metadata.urlRoute}/custom/graphql`,
                });

                global.omnihive.registeredUrls.push({
                    path: `${global.omnihive.serverSettings.config.webRootUrl}/${this.metadata.urlRoute}/custom/graphql`,
                    type: RegisteredUrlType.GraphFunction,
                    metadata: {},
                });
            }

            logWorker?.write(OmniHiveLogLevel.Info, `Graph Progress => Custom Functions Endpoint Registered`);
            logWorker?.write(OmniHiveLogLevel.Info, `REST Server Generation Started`);

            // Register "custom" REST endpoints
            if (
                this.registeredWorkers.some(
                    (worker: RegisteredHiveWorker) =>
                        worker.type === HiveWorkerType.RestEndpointFunction && worker.enabled === true
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
                            url: `${global.omnihive.serverSettings.config.webRootUrl}/${this.metadata.urlRoute}/custom/rest`,
                        },
                    ],
                };

                const restWorkers = this.registeredWorkers.filter(
                    (rw: RegisteredHiveWorker) =>
                        rw.type === HiveWorkerType.RestEndpointFunction && rw.enabled === true && rw.core === false
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
                        `/${this.metadata.urlRoute}/custom/rest/${workerMetaData.urlRoute}`,
                        async (req: express.Request, res: express.Response) => {
                            res.setHeader("Content-Type", "application/json");

                            try {
                                const workerResponse: RestEndpointExecuteResponse = await workerInstance.execute(
                                    req.headers,
                                    `${req.protocol}://${req.get("host")}${req.originalUrl}`,
                                    req.body
                                );

                                if (workerResponse.response) {
                                    res.status(workerResponse.status).json(workerResponse.response);
                                } else {
                                    res.status(workerResponse.status).send(true);
                                }
                            } catch (e) {
                                return res.status(500).render("500", {
                                    rootUrl: global.omnihive.serverSettings.config.webRootUrl,
                                    error: serializeError(e),
                                });
                            }
                        }
                    );

                    global.omnihive.registeredUrls.push({
                        path: `${global.omnihive.serverSettings.config.webRootUrl}/${this.metadata.urlRoute}/custom/rest/${workerMetaData.urlRoute}`,
                        type: RegisteredUrlType.RestFunction,
                        metadata: {},
                    });

                    const workerSwagger: swaggerUi.JsonObject | undefined = workerInstance.getSwaggerDefinition();

                    if (workerSwagger) {
                        swaggerDefinition.paths = { ...swaggerDefinition.paths, ...workerSwagger.paths };
                        swaggerDefinition.definitions = {
                            ...swaggerDefinition.definitions,
                            ...workerSwagger.definitions,
                        };
                    }
                });

                if (((await featureWorker?.get<boolean>("swagger")) ?? true) && restWorkers.length > 0) {
                    app.get(
                        `/${this.metadata.urlRoute}/custom/rest/api-docs/swagger.json`,
                        async (_req: express.Request, res: express.Response) => {
                            res.setHeader("Content-Type", "application/json");
                            return res.status(200).json(swaggerDefinition);
                        }
                    );

                    app.use(
                        `/${this.metadata.urlRoute}/custom/rest/api-docs`,
                        swaggerUi.serve,
                        swaggerUi.setup(swaggerDefinition)
                    );

                    global.omnihive.registeredUrls.push({
                        path: `${global.omnihive.serverSettings.config.webRootUrl}/${this.metadata.urlRoute}/custom/rest/api-docs`,
                        type: RegisteredUrlType.Swagger,
                        metadata: {
                            swaggerJsonUrl: `${global.omnihive.serverSettings.config.webRootUrl}/${this.metadata.urlRoute}/custom/rest/api-docs/swagger.json`,
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
}
