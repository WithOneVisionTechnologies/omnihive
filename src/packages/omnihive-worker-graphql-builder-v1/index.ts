import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { LifecycleWorkerAction } from "@withonevision/omnihive-core/enums/LifecycleWorkerAction";
import { LifecycleWorkerStage } from "@withonevision/omnihive-core/enums/LifecycleWorkerStage";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { StringBuilder } from "@withonevision/omnihive-core/helpers/StringBuilder";
import { IDatabaseWorker } from "@withonevision/omnihive-core/interfaces/IDatabaseWorker";
import { IGraphBuildWorker } from "@withonevision/omnihive-core/interfaces/IGraphBuildWorker";
import { ConnectionSchema } from "@withonevision/omnihive-core/models/ConnectionSchema";
import { HiveWorker } from "@withonevision/omnihive-core/models/HiveWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import { HiveWorkerMetadataGraphBuilder } from "@withonevision/omnihive-core/models/HiveWorkerMetadataGraphBuilder";
import { HiveWorkerMetadataLifecycleFunction } from "@withonevision/omnihive-core/models/HiveWorkerMetadataLifecycleFunction";
import { RegisteredHiveWorker } from "@withonevision/omnihive-core/models/RegisteredHiveWorker";
import { StoredProcSchema } from "@withonevision/omnihive-core/models/StoredProcSchema";
import { TableSchema } from "@withonevision/omnihive-core/models/TableSchema";
import _ from "lodash";
import pluralize from "pluralize";
import { GraphHelper } from "./helpers/GraphHelper";

export default class GraphBuilder extends HiveWorkerBase implements IGraphBuildWorker {
    constructor() {
        super();
    }

    public async init(config: HiveWorker): Promise<void> {
        await AwaitHelper.execute<void>(super.init(config));
        this.checkObjectStructure<HiveWorkerMetadataGraphBuilder>(HiveWorkerMetadataGraphBuilder, config.metadata);
    }

    public buildDatabaseWorkerSchema = (
        databaseWorker: IDatabaseWorker,
        connectionSchema: ConnectionSchema | undefined
    ): string => {
        if (!connectionSchema) {
            throw new Error("Connection Schema is Undefined.");
        }

        const enabledWorkers: RegisteredHiveWorker[] = this.registeredWorkers.filter(
            (rw: RegisteredHiveWorker) => rw.enabled === true
        );

        const tables = _.uniqBy(connectionSchema.tables, "tableName");
        const lifecycleWorkers: RegisteredHiveWorker[] = enabledWorkers.filter(
            (rw: RegisteredHiveWorker) => rw.type === HiveWorkerType.DataLifecycleFunction
        );
        const builder: StringBuilder = new StringBuilder();
        const graphHelper: GraphHelper = new GraphHelper();

        // Get imports
        builder.appendLine(
            `var { GraphQLEnumType, GraphQLInt, GraphQLSchema, GraphQLString, GraphQLBoolean, GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLInputObjectType } = require("graphql");`
        );
        builder.appendLine(`var { GraphQLJSONObject } = require("@withonevision/omnihive-core/models/GraphQLJSON");`);
        builder.appendLine(`var { AwaitHelper } = require("@withonevision/omnihive-core/helpers/AwaitHelper");`);
        builder.appendLine(`var { HiveWorkerType } = require("@withonevision/omnihive-core/enums/HiveWorkerType");`);
        builder.appendLine(
            `var { ParseMaster } = require("@withonevision/omnihive-worker-graphql-builder-v1/parsers/ParseMaster");`
        );
        builder.appendLine();

        builder.appendLine(`var WhereModes = new GraphQLEnumType({
            name: "WhereMode",
            values: {
                all: { value: "all" },
                specific: { value: "specific" },
            }
        })`);
        builder.appendLine();

        enabledWorkers.forEach((rw: RegisteredHiveWorker) => {
            builder.appendLine(`var ${rw.name} = require("${rw.importPath}");`);
        });

        // Loop through tables and build base objects
        // ObjectType, MutationType, MutationWhereType
        tables.forEach((table: TableSchema) => {
            // Get meta things
            const tableSchema: TableSchema[] = connectionSchema.tables.filter((schema: TableSchema) => {
                return schema.tableName === table.tableName;
            });

            const fullSchema: TableSchema[] = connectionSchema.tables;
            const primaryKey: TableSchema = tableSchema.filter((ts: TableSchema) => ts.columnIsPrimaryKey === true)[0];
            const primarySchema: TableSchema[] = fullSchema.filter((schema: TableSchema) => {
                return schema.columnForeignKeyTableName === tableSchema[0].tableName;
            });

            if (!primaryKey) {
                throw new Error(`Cannot find primary key for ${table.tableName} in ${databaseWorker.config.name}`);
            }

            const foreignSchema: TableSchema[] = [];
            tableSchema.forEach((column: TableSchema) => {
                if (column.columnIsForeignKey) {
                    foreignSchema.push(column);
                }
            });

            // Base Object Type => Definitions
            builder.appendLine(
                `var ${pluralize.singular(tableSchema[0].tableNamePascalCase)}ObjectType = new GraphQLObjectType({`
            );
            builder.appendLine(`\tname: "${pluralize.singular(tableSchema[0].tableNameCamelCase)}",`);
            builder.appendLine(`\textensions: {`);
            builder.appendLine(`\t\tdbWorkerInstance: "${databaseWorker.config.name}",`);
            builder.appendLine(`\t\tdbTableName: "${tableSchema[0].tableName}",`);
            builder.appendLine(`\t\tdbPrimaryKey: "${primaryKey.columnNameDatabase}",`);
            builder.appendLine(`\t},`);
            builder.appendLine(`\tfields: () => ({`);

            // Base Object Type => Table Fields
            tableSchema.forEach((column: TableSchema) => {
                builder.appendLine(`\t\t${column.columnNameEntity}: {`);
                builder.append(`\t\t\ttype: `);
                builder.append(graphHelper.getGraphTypeFromEntityType(column.columnTypeEntity));
                builder.appendLine(`,`);
                builder.appendLine(`\t\t\textensions: {`);
                builder.appendLine(`\t\t\t\tdbColumnName: "${column.columnNameDatabase}",`);
                builder.appendLine(`\t\t\t\tdbColumnType: "${column.columnTypeDatabase}",`);
                builder.appendLine(`\t\t\t},`);
                builder.appendLine(`\t\t},`);
            });

            // Base Object Type => Relationship Fields => Primary Keys
            primarySchema.forEach((schema: TableSchema) => {
                const fieldName: string = `from_${pluralize.plural(schema.tableNameCamelCase)}_using_${
                    schema.columnNameEntity
                }`;

                builder.appendLine(`\t\t${fieldName}: {`);
                builder.appendLine(
                    `\t\t\ttype: new GraphQLList(${pluralize.singular(schema.tableNamePascalCase)}ObjectType),`
                );
                builder.appendLine(`\t\t\targs: {`);

                const primarySchemaColumns = connectionSchema.tables.filter(
                    (value: TableSchema) => value.tableName === schema.tableName
                );
                let joinPrimaryKeyColumnName: string = "";

                primarySchemaColumns.forEach((column: TableSchema) => {
                    builder.appendLine(
                        `\t\t\t\t${column.columnNameEntity}: { type : GraphQLString, extensions: { dbColumnName: "${column.columnNameDatabase}"} },`
                    );

                    if (column.columnIsPrimaryKey) {
                        joinPrimaryKeyColumnName = column.columnNameDatabase;
                    }
                });
                builder.appendLine("\t\t\t\tobjPage: { type : GraphQLInt },");
                builder.appendLine("\t\t\t\tobjLimit: { type : GraphQLInt },");

                builder.appendLine(`\t\t\t},`);
                builder.appendLine(`\t\t\textensions: {`);
                builder.appendLine(`\t\t\t\tdbJoinForeignColumn: "${schema.columnForeignKeyColumnName}",`);
                builder.appendLine(`\t\t\t\tdbJoinForeignTable: "${schema.columnForeignKeyTableName}",`);
                builder.appendLine(`\t\t\t\tdbJoinPrimaryColumn: "${schema.columnNameDatabase}",`);
                builder.appendLine(`\t\t\t\tdbJoinPrimaryTable: "${schema.tableName}",`);
                builder.appendLine(`\t\t\t\tdbJoinForeignTablePrimaryKey: "${joinPrimaryKeyColumnName}",`);
                builder.appendLine(`\t\t\t\tdbTableName: "${schema.tableName}",`);
                builder.appendLine(`\t\t\t},`);
                builder.appendLine(`\t\t},`);
            });

            // Base Object Type => Relationship Fields => Foreign Keys
            foreignSchema.forEach((schema: TableSchema) => {
                const fieldName: string = `to_${pluralize.plural(schema.columnForeignKeyTableNameCamelCase)}_using_${
                    schema.columnNameEntity
                }`;

                builder.appendLine(`\t\t${fieldName}: {`);
                builder.appendLine(
                    `\t\t\ttype: ${pluralize.singular(schema.columnForeignKeyTableNamePascalCase)}ObjectType,`
                );
                builder.appendLine(`\t\t\targs: {`);

                const foreignSchemaColumns = connectionSchema.tables.filter(
                    (value: TableSchema) => value.tableName === schema.columnForeignKeyTableName
                );
                let joinPrimaryKeyColumnName: string = "";

                foreignSchemaColumns.forEach((column: TableSchema) => {
                    builder.appendLine(`\t\t\t\t${column.columnNameEntity}: { type : GraphQLString },`);

                    if (column.columnIsPrimaryKey) {
                        joinPrimaryKeyColumnName = column.columnNameDatabase;
                    }
                });

                builder.appendLine("\t\t\t\tobjPage: { type : GraphQLInt },");
                builder.appendLine("\t\t\t\tobjLimit: { type : GraphQLInt },");

                builder.appendLine(`\t\t\t},`);
                builder.appendLine(`\t\t\textensions: {`);
                builder.appendLine(`\t\t\t\tdbJoinForeignColumn: "${schema.columnForeignKeyColumnName}",`);
                builder.appendLine(`\t\t\t\tdbJoinForeignTable: "${schema.columnForeignKeyTableName}",`);
                builder.appendLine(`\t\t\t\tdbJoinPrimaryColumn: "${schema.columnNameDatabase}",`);
                builder.appendLine(`\t\t\t\tdbJoinPrimaryTable: "${schema.tableName}",`);
                builder.appendLine(`\t\t\t\tdbJoinForeignTablePrimaryKey: "${joinPrimaryKeyColumnName}",`);
                builder.appendLine(`\t\t\t\tdbTableName: "${schema.columnForeignKeyTableName}",`);
                builder.appendLine(`\t\t\t},`);
                builder.appendLine(`\t\t},`);
            });

            builder.appendLine(`\t}),`);
            builder.appendLine(`});`);

            builder.appendLine();

            // Build Aggregate Object
            builder.appendLine(
                `var ${pluralize.singular(tableSchema[0].tableNamePascalCase)}AggObjectType = new GraphQLObjectType({`
            );
            builder.appendLine(`\tname: "${pluralize.singular(tableSchema[0].tableNameCamelCase)}_agg",`);
            builder.appendLine(`\textensions: {`);
            builder.appendLine(`\t\tdbWorkerInstance: "${databaseWorker.config.name}",`);
            builder.appendLine(`\t\tdbTableName: "${tableSchema[0].tableName}",`);
            builder.appendLine(`\t\tdbPrimaryKey: "${primaryKey.columnNameDatabase}",`);
            builder.appendLine(`\t\taggregateType: true,`);
            builder.appendLine(`\t},`);
            builder.appendLine(`\tfields: () => ({`);

            // Base Agg Object Type => Agg Functions
            // Count Aggregate
            builder.appendLine(`\t\t\tcount: {`);
            builder.appendLine(`\t\t\t\tdescription : "Retreive the count of the arguments retrieved",`);
            builder.appendLine(`\t\t\t\ttype : GraphQLInt,`);
            builder.appendLine(`\t\t\t\targs: {`);

            // Count Arguments
            tableSchema.forEach((column: TableSchema) => {
                builder.append(`\t\t\t\t\t${column.columnNameEntity}: {`);
                builder.append(` type: GraphQLBoolean`);
                builder.append(`, extensions: { `);
                builder.append(`dbColumnName: "${column.columnNameDatabase}" }`);
                builder.appendLine(` },`);
            });
            builder.appendLine(`\t\t\t\t},`);

            // Count Meta Data
            builder.appendLine(`\t\t\t\textensions: {`);
            builder.appendLine(`\t\t\t\t\tknexFunction: "count"`);
            builder.appendLine(`\t\t\t\t}`);
            builder.appendLine(`\t\t\t},`);

            // Count Distinct Aggregate
            builder.appendLine(`\t\t\tcountDistinct: {`);
            builder.appendLine(`\t\t\t\tdescription : "Retreive the maximum value for the argument",`);
            builder.appendLine(`\t\t\t\ttype : GraphQLInt,`);
            builder.appendLine(`\t\t\t\targs: {`);

            // Count Distinct Arguments
            tableSchema.forEach((column: TableSchema) => {
                builder.append(`\t\t\t\t\t${column.columnNameEntity}: {`);
                builder.append(` type: GraphQLBoolean`);
                builder.append(`, extensions: { `);
                builder.append(`dbColumnName: "${column.columnNameDatabase}" }`);
                builder.appendLine(` },`);
            });
            builder.appendLine(`\t\t\t\t},`);

            // Count Distinct Meta Data
            builder.appendLine(`\t\t\t\textensions: {`);
            builder.appendLine(`\t\t\t\t\tknexFunction: "countDistinct"`);
            builder.appendLine(`\t\t\t\t}`);
            builder.appendLine(`\t\t\t},`);

            // Min Aggregate
            builder.appendLine(`\t\t\tmin: {`);
            builder.appendLine(`\t\t\t\tdescription : "Retreive the minimum value for the argument",`);
            builder.appendLine(`\t\t\t\ttype : GraphQLInt,`);
            builder.appendLine(`\t\t\t\targs: {`);

            // Min Arguments
            tableSchema.forEach((column: TableSchema) => {
                builder.append(`\t\t\t\t\t${column.columnNameEntity}: {`);
                builder.append(` type: GraphQLBoolean`);
                builder.append(`, extensions: { `);
                builder.append(`dbColumnName: "${column.columnNameDatabase}" }`);
                builder.appendLine(` },`);
            });
            builder.appendLine(`\t\t\t\t},`);

            // Min Meta Data
            builder.appendLine(`\t\t\t\textensions: {`);
            builder.appendLine(`\t\t\t\t\tknexFunction: "min"`);
            builder.appendLine(`\t\t\t\t}`);
            builder.appendLine(`\t\t\t},`);

            // Max Aggregate
            builder.appendLine(`\t\t\tmax: {`);
            builder.appendLine(`\t\t\t\tdescription : "Retreive the maximum value for the argument",`);
            builder.appendLine(`\t\t\t\ttype : GraphQLInt,`);
            builder.appendLine(`\t\t\t\targs: {`);

            // Max Arguments
            tableSchema.forEach((column: TableSchema) => {
                builder.append(`\t\t\t\t\t${column.columnNameEntity}: {`);
                builder.append(` type: GraphQLBoolean`);
                builder.append(`, extensions: { `);
                builder.append(`dbColumnName: "${column.columnNameDatabase}" }`);
                builder.appendLine(` },`);
            });
            builder.appendLine(`\t\t\t\t},`);

            // Max Meta Data
            builder.appendLine(`\t\t\t\textensions: {`);
            builder.appendLine(`\t\t\t\t\tknexFunction: "max"`);
            builder.appendLine(`\t\t\t\t}`);
            builder.appendLine(`\t\t\t},`);

            // Sum Aggregate
            builder.appendLine(`\t\t\tsum: {`);
            builder.appendLine(`\t\t\t\tdescription : "Retreive the count of the arguments retrieved",`);
            builder.appendLine(`\t\t\t\ttype : GraphQLInt,`);
            builder.appendLine(`\t\t\t\targs: {`);

            // Sum Arguments
            tableSchema.forEach((column: TableSchema) => {
                builder.append(`\t\t\t\t\t${column.columnNameEntity}: {`);
                builder.append(` type: GraphQLBoolean`);
                builder.append(`, extensions: { `);
                builder.append(`dbColumnName: "${column.columnNameDatabase}" }`);
                builder.appendLine(` },`);
            });
            builder.appendLine(`\t\t\t\t},`);

            // Sum Meta Data
            builder.appendLine(`\t\t\t\textensions: {`);
            builder.appendLine(`\t\t\t\t\tknexFunction: "sum"`);
            builder.appendLine(`\t\t\t\t}`);
            builder.appendLine(`\t\t\t},`);

            // Sum Distinct Aggregate
            builder.appendLine(`\t\t\tsumDistinct: {`);
            builder.appendLine(`\t\t\t\tdescription : "Retreive the count of the arguments retrieved",`);
            builder.appendLine(`\t\t\t\ttype : GraphQLInt,`);
            builder.appendLine(`\t\t\t\targs: {`);

            // Sum Distinct Arguments
            tableSchema.forEach((column: TableSchema) => {
                builder.append(`\t\t\t\t\t${column.columnNameEntity}: {`);
                builder.append(` type: GraphQLBoolean`);
                builder.append(`, extensions: { `);
                builder.append(`dbColumnName: "${column.columnNameDatabase}" }`);
                builder.appendLine(` },`);
            });
            builder.appendLine(`\t\t\t\t},`);

            // Sum Distinct Meta Data
            builder.appendLine(`\t\t\t\textensions: {`);
            builder.appendLine(`\t\t\t\t\tknexFunction: "sumDistinct"`);
            builder.appendLine(`\t\t\t\t}`);
            builder.appendLine(`\t\t\t},`);

            // Average Aggregate
            builder.appendLine(`\t\t\tavg: {`);
            builder.appendLine(`\t\t\t\tdescription : "Retreive the count of the arguments retrieved",`);
            builder.appendLine(`\t\t\t\ttype : GraphQLInt,`);
            builder.appendLine(`\t\t\t\targs: {`);

            // Average Arguments
            tableSchema.forEach((column: TableSchema) => {
                builder.append(`\t\t\t\t\t${column.columnNameEntity}: {`);
                builder.append(` type: GraphQLBoolean`);
                builder.append(`, extensions: { `);
                builder.append(`dbColumnName: "${column.columnNameDatabase}" }`);
                builder.appendLine(` },`);
            });
            builder.appendLine(`\t\t\t\t},`);

            // Average Meta Data
            builder.appendLine(`\t\t\t\textensions: {`);
            builder.appendLine(`\t\t\t\t\tknexFunction: "avg"`);
            builder.appendLine(`\t\t\t\t}`);
            builder.appendLine(`\t\t\t},`);

            // Average Distinct Aggregate
            builder.appendLine(`\t\t\tavgDistinct: {`);
            builder.appendLine(`\t\t\t\tdescription : "Retreive the count of the arguments retrieved",`);
            builder.appendLine(`\t\t\t\ttype : GraphQLInt,`);
            builder.appendLine(`\t\t\t\targs: {`);

            // Average Distinct Arguments
            tableSchema.forEach((column: TableSchema) => {
                builder.append(`\t\t\t\t\t${column.columnNameEntity}: {`);
                builder.append(` type: GraphQLBoolean`);
                builder.append(`, extensions: { `);
                builder.append(`dbColumnName: "${column.columnNameDatabase}" }`);
                builder.appendLine(` },`);
            });
            builder.appendLine(`\t\t\t\t},`);

            // Average Distinct Meta Data
            builder.appendLine(`\t\t\t\textensions: {`);
            builder.appendLine(`\t\t\t\t\tknexFunction: "avgDistinct"`);
            builder.appendLine(`\t\t\t\t}`);
            builder.appendLine(`\t\t\t},`);

            // Base Agg Object Type => Relationship Fields => Primary Keys
            primarySchema.forEach((schema: TableSchema) => {
                const fieldName: string = `from_${pluralize.plural(schema.tableNameCamelCase)}_agg_using_${
                    schema.columnNameEntity
                }`;

                builder.appendLine(`\t\t${fieldName}: {`);
                builder.appendLine(
                    `\t\t\ttype: new GraphQLList(${pluralize.singular(schema.tableNamePascalCase)}AggObjectType),`
                );
                builder.appendLine(`\t\t\targs: {`);

                const primarySchemaColumns = connectionSchema.tables.filter(
                    (value: TableSchema) => value.tableName === schema.tableName
                );
                let joinPrimaryKeyColumnName: string = "";

                primarySchemaColumns.forEach((column: TableSchema) => {
                    builder.appendLine(
                        `\t\t\t\t${column.columnNameEntity}: { type : GraphQLString, extensions: { dbColumnName: "${column.columnNameDatabase}"} },`
                    );

                    if (column.columnIsPrimaryKey) {
                        joinPrimaryKeyColumnName = column.columnNameDatabase;
                    }
                });

                builder.appendLine(`\t\t\t},`);
                builder.appendLine(`\t\t\textensions: {`);
                builder.appendLine(`\t\t\t\tdbJoinForeignColumn: "${schema.columnForeignKeyColumnName}",`);
                builder.appendLine(`\t\t\t\tdbJoinForeignTable: "${schema.columnForeignKeyTableName}",`);
                builder.appendLine(`\t\t\t\tdbJoinPrimaryColumn: "${schema.columnNameDatabase}",`);
                builder.appendLine(`\t\t\t\tdbJoinPrimaryTable: "${schema.tableName}",`);
                builder.appendLine(`\t\t\t\tdbJoinForeignTablePrimaryKey: "${joinPrimaryKeyColumnName}",`);
                builder.appendLine(`\t\t\t\tdbTableName: "${schema.tableName}",`);
                builder.appendLine(`\t\t\t\taggregateType: true,`);
                builder.appendLine(`\t\t\t},`);
                builder.appendLine(`\t\t},`);
            });

            // Base Agg Object Type => Relationship Fields => Foreign Keys
            foreignSchema.forEach((schema: TableSchema) => {
                const fieldName: string = `to_${pluralize.plural(
                    schema.columnForeignKeyTableNameCamelCase
                )}_agg_using_${schema.columnNameEntity}`;

                builder.appendLine(`\t\t${fieldName}: {`);
                builder.appendLine(
                    `\t\t\ttype: ${pluralize.singular(schema.columnForeignKeyTableNamePascalCase)}AggObjectType,`
                );
                builder.appendLine(`\t\t\targs: {`);

                const foreignSchemaColumns = connectionSchema.tables.filter(
                    (value: TableSchema) => value.tableName === schema.columnForeignKeyTableName
                );
                let joinPrimaryKeyColumnName: string = "";

                foreignSchemaColumns.forEach((column: TableSchema) => {
                    builder.appendLine(
                        `\t\t\t\t\t${column.columnNameEntity}: { type : GraphQLString, extensions: { dbColumnName: "${column.columnNameDatabase}"} },`
                    );

                    if (column.columnIsPrimaryKey) {
                        joinPrimaryKeyColumnName = column.columnNameDatabase;
                    }
                });

                builder.appendLine(`\t\t\t},`);
                builder.appendLine(`\t\t\textensions: {`);
                builder.appendLine(`\t\t\t\tdbJoinForeignColumn: "${schema.columnForeignKeyColumnName}",`);
                builder.appendLine(`\t\t\t\tdbJoinForeignTable: "${schema.columnForeignKeyTableName}",`);
                builder.appendLine(`\t\t\t\tdbJoinPrimaryColumn: "${schema.columnNameDatabase}",`);
                builder.appendLine(`\t\t\t\tdbJoinPrimaryTable: "${schema.tableName}",`);
                builder.appendLine(`\t\t\t\tdbJoinForeignTablePrimaryKey: "${joinPrimaryKeyColumnName}",`);
                builder.appendLine(`\t\t\t\tdbTableName: "${schema.columnForeignKeyTableName}",`);
                builder.appendLine(`\t\t\t\taggregateType: true,`);
                builder.appendLine(`\t\t\t},`);
                builder.appendLine(`\t\t},`);
            });

            builder.appendLine(`\t}),`);
            builder.appendLine(`});`);

            builder.appendLine();

            // Mutation Base Object
            builder.appendLine(
                `var ${pluralize.singular(
                    tableSchema[0].tableNamePascalCase
                )}MutationType = new GraphQLInputObjectType({`
            );
            builder.appendLine(`\tname: "${pluralize.singular(tableSchema[0].tableNameCamelCase)}MutationType",`);
            builder.appendLine(`\tfields: () => ({`);

            tableSchema.forEach((column: TableSchema) => {
                if (column.columnTypeEntity !== "unknown") {
                    builder.appendLine(`\t\t${column.columnNameEntity}: {`);
                    builder.append(`\t\t\ttype: `);
                    builder.append(graphHelper.getGraphTypeFromEntityType(column.columnTypeEntity));
                    builder.appendLine();
                    builder.appendLine(`\t\t},`);
                }
            });

            builder.appendLine(`\t})`);
            builder.appendLine(`});`);

            builder.appendLine();

            // Mutation Where Object
            builder.appendLine(
                `var ${pluralize.singular(
                    tableSchema[0].tableNamePascalCase
                )}MutationWhereType = new GraphQLInputObjectType({`
            );
            builder.appendLine(`\tname: "${pluralize.singular(tableSchema[0].tableNameCamelCase)}MutationWhereType",`);
            builder.appendLine(`\tfields: () => ({`);

            tableSchema.forEach((column: TableSchema) => {
                builder.appendLine(`\t\t${column.columnNameEntity}: {`);
                builder.appendLine(`\t\t\ttype: GraphQLString`);
                builder.appendLine(`\t\t},`);
            });

            builder.appendLine(`\t})`);
            builder.appendLine(`});`);

            builder.appendLine();
        }); // End of first table loop where base objects are built

        // Custom SQL Type
        builder.appendLine(`var CustomSqlObjectType = new GraphQLObjectType({`);
        builder.appendLine(`\tname: "customSql",`);
        builder.appendLine(`\tfields: () => ({`);
        builder.appendLine(`\t\trecordset: { type : GraphQLJSONObject },`);
        builder.appendLine(`\t}),`);
        builder.appendLine(`});`);
        builder.appendLine();

        // Build main graph schema
        builder.appendLine(`exports.FederatedGraphQuerySchema = new GraphQLSchema({`);

        // Query Object Type
        builder.appendLine(`\tquery: new GraphQLObjectType({`);
        builder.appendLine(`\t\tname: 'Query',`);
        builder.appendLine(`\t\tfields: () => ({`);

        // Custom SQL
        builder.appendLine(`\t\t\tcustomSql: {`);
        builder.appendLine(`\t\t\t\ttype: new GraphQLList(CustomSqlObjectType),`);
        builder.appendLine(`\t\t\t\targs: {`);
        builder.appendLine(`\t\t\t\t\tencryptedSql: { type : GraphQLNonNull(GraphQLString) },`);
        builder.appendLine(`\t\t\t\t},`);
        builder.appendLine(`\t\t\t\tresolve: async (parent, args, context, resolveInfo) => {`);
        builder.appendLine(`\t\t\t\t\tvar graphParser = new ParseMaster();`);
        builder.appendLine(
            `\t\t\t\t\tvar dbResponse = await AwaitHelper.execute(graphParser.parseCustomSql("${databaseWorker.config.name}", args.encryptedSql, context.omnihive));`
        );
        builder.appendLine(`\t\t\t\t\treturn [{ recordset: dbResponse }];`);
        builder.appendLine(`\t\t\t\t},`);
        builder.appendLine(`\t\t\t},`);

        // Loop through tables and create query fields
        tables.forEach((table: TableSchema) => {
            // Get meta things
            const tableSchema: TableSchema[] = connectionSchema.tables.filter((schema: TableSchema) => {
                return schema.tableName === table.tableName;
            });

            // Build base query
            builder.appendLine(`\t\t\t${pluralize.plural(tableSchema[0].tableNameCamelCase)}: {`);
            builder.appendLine(
                `\t\t\t\ttype: new GraphQLList(${pluralize.singular(tableSchema[0].tableNamePascalCase)}ObjectType),`
            );
            builder.appendLine(`\t\t\t\targs: {`);

            tableSchema.forEach((column: TableSchema) => {
                builder.appendLine(`\t\t\t\t\t${column.columnNameEntity}: { type : GraphQLString },`);
            });

            builder.appendLine("\t\t\t\t\twhereMode: { type : WhereModes },");
            builder.appendLine("\t\t\t\t\tdbPage: { type : GraphQLInt },");
            builder.appendLine("\t\t\t\t\tdbLimit: { type : GraphQLInt },");
            builder.appendLine(`\t\t\t\t},`);
            builder.appendLine(`\t\t\t\tresolve: async (parent, args, context, resolveInfo) => {`);
            builder.appendLine(`\t\t\t\t\tvar graphParser = new ParseMaster();`);
            builder.appendLine(
                `\t\t\t\t\treturn await AwaitHelper.execute(graphParser.parseAstQuery("${databaseWorker.config.name}", resolveInfo, context.omnihive));`
            );
            builder.appendLine(`\t\t\t\t}`);
            builder.appendLine(`\t\t\t},`);

            // Build Aggregate Query
            builder.appendLine(`\t\t\t${pluralize.plural(tableSchema[0].tableNameCamelCase)}_agg: {`);
            builder.appendLine(
                `\t\t\t\ttype: new GraphQLList(${pluralize.singular(tableSchema[0].tableNamePascalCase)}AggObjectType),`
            );
            builder.appendLine(`\t\t\t\targs: {`);

            tableSchema.forEach((column: TableSchema) => {
                builder.appendLine(
                    `\t\t\t\t\t${column.columnNameEntity}: { type : GraphQLString, extensions: { dbColumnName: "${column.columnNameDatabase}"} },`
                );
            });

            builder.appendLine(`\t\t\t\t},`);
            builder.appendLine(`\t\t\t\tresolve: async (parent, args, context, resolveInfo) => {`);
            builder.appendLine(`\t\t\t\t\tvar graphParser = new ParseMaster();`);
            builder.appendLine(
                `\t\t\t\t\treturn await AwaitHelper.execute(graphParser.parseAstQuery("${databaseWorker.config.name}", resolveInfo, context.omnihive));`
            );
            builder.appendLine(`\t\t\t\t}`);
            builder.appendLine(`\t\t\t},`);
        });

        // Close query schema
        builder.appendLine(`\t\t})`);
        builder.appendLine(`\t}),`);
        builder.appendLine(`\tmutation: new GraphQLObjectType({`);
        builder.appendLine(`\t\tname: "Mutation",`);
        builder.appendLine(`\t\tfields: () => ({`);

        // Mutation schema fields
        tables.forEach((table: TableSchema) => {
            // Get meta things
            const tableSchema: TableSchema[] = connectionSchema.tables.filter((schema: TableSchema) => {
                return schema.tableName === table.tableName;
            });

            // Insert
            builder.appendLine(`\t\t\tinsert_${pluralize.plural(tableSchema[0].tableNamePascalCase)}: {`);
            builder.appendLine(
                `\t\t\t\ttype: new GraphQLList(${pluralize.singular(tableSchema[0].tableNamePascalCase)}ObjectType),`
            );
            builder.appendLine(`\t\t\t\targs: {`);
            builder.appendLine(`\t\t\t\t\t${pluralize.plural(tableSchema[0].tableNameCamelCase)}: {`);
            builder.appendLine(
                `\t\t\t\t\t\ttype: new GraphQLList(${pluralize.singular(
                    tableSchema[0].tableNamePascalCase
                )}MutationType),`
            );
            builder.appendLine(`\t\t\t\t\t},`);
            builder.appendLine(`\t\t\t\t\tcustomDmlArgs: {`);
            builder.appendLine(`\t\t\t\t\t\ttype: GraphQLJSONObject`);
            builder.appendLine(`\t\t\t\t\t},`);
            builder.appendLine(`\t\t\t\t},`);
            builder.appendLine(
                `\t\t\t\tresolve: async (parent, { ${pluralize.plural(
                    tableSchema[0].tableNameCamelCase
                )}, customDmlArgs }, context, resolveInfo) => {`
            );
            builder.appendLine(`\t\t\t\t\tvar graphParser = new ParseMaster();`);
            builder.appendLine();
            builder.appendLine(`\t\t\t\t\ttry {`);
            builder.appendLine();

            // Before insert custom function
            const beforeInsertArray: { worker: RegisteredHiveWorker; order: number }[] = [];

            lifecycleWorkers.forEach((lifecycleWorker: RegisteredHiveWorker) => {
                const metadata: HiveWorkerMetadataLifecycleFunction = lifecycleWorker.metadata as HiveWorkerMetadataLifecycleFunction;
                if (
                    lifecycleWorker.type == HiveWorkerType.DataLifecycleFunction &&
                    metadata.lifecycleStage == LifecycleWorkerStage.Before &&
                    metadata.lifecycleAction == LifecycleWorkerAction.Insert &&
                    metadata.lifecycleWorker === databaseWorker.config.name &&
                    metadata.lifecycleTables.some(
                        (lifecycleTable) => lifecycleTable === tableSchema[0].tableName || lifecycleTable === "*"
                    )
                ) {
                    beforeInsertArray.push({
                        worker: lifecycleWorker,
                        order: metadata.lifecycleOrder,
                    });
                }
            });

            if (beforeInsertArray.length > 0) {
                _.orderBy(beforeInsertArray, ["lifecycleOrder"], ["asc"]).forEach((lifecycleWorker) => {
                    builder.appendLine(
                        `\t\t\t\t\t\t${lifecycleWorker.worker.name}Instance = global.omnihive.registeredWorkers.find((worker) => worker.name === "${lifecycleWorker.worker.name}").instance;`
                    );
                    builder.appendLine(
                        `\t\t\t\t\t\t{${pluralize.plural(tableSchema[0].tableNameCamelCase)}, customDmlArgs} = ${
                            lifecycleWorker.worker.name
                        }Instance("${databaseWorker.config.name}", "${tableSchema[0].tableName}", ${pluralize.plural(
                            tableSchema[0].tableNameCamelCase
                        )}, customDmlArgs, context.omnihive);`
                    );
                });
            }

            builder.appendLine();

            // Instead of insert custom function
            const insteadOfInsertArray: { worker: RegisteredHiveWorker; order: number }[] = [];

            lifecycleWorkers.forEach((lifecycleWorker: RegisteredHiveWorker) => {
                const metadata: HiveWorkerMetadataLifecycleFunction = lifecycleWorker.metadata as HiveWorkerMetadataLifecycleFunction;
                if (
                    lifecycleWorker.type == HiveWorkerType.DataLifecycleFunction &&
                    metadata.lifecycleStage == LifecycleWorkerStage.InsteadOf &&
                    metadata.lifecycleAction == LifecycleWorkerAction.Insert &&
                    metadata.lifecycleWorker === databaseWorker.config.name &&
                    metadata.lifecycleTables.some(
                        (lifecycleTable) => lifecycleTable === tableSchema[0].tableName || lifecycleTable === "*"
                    )
                ) {
                    insteadOfInsertArray.push({
                        worker: lifecycleWorker,
                        order: metadata.lifecycleOrder,
                    });
                }
            });

            if (insteadOfInsertArray.length > 0) {
                _.orderBy(insteadOfInsertArray, ["lifecycleOrder"], ["asc"]).forEach((lifecycleWorker, index) => {
                    builder.appendLine(
                        `\t\t\t\t\t\t${lifecycleWorker.worker.name}Instance = global.omnihive.registeredWorkers.find((worker) => worker.name === "${lifecycleWorker.worker.name}").instance;`
                    );
                    if (index === insteadOfInsertArray.length - 1) {
                        builder.appendLine(
                            `\t\t\t\t\t\tvar insertResponse = ${lifecycleWorker.worker.name}Instance("${
                                databaseWorker.config.name
                            }", "${tableSchema[0].tableName}", ${pluralize.plural(
                                tableSchema[0].tableNameCamelCase
                            )}, customDmlArgs, context.omnihive);`
                        );
                    } else {
                        builder.appendLine(
                            `\t\t\t\t\t\t{${pluralize.plural(tableSchema[0].tableNameCamelCase)}, customDmlArgs} = ${
                                lifecycleWorker.worker.name
                            }Instance("${databaseWorker.config.name}", "${
                                tableSchema[0].tableName
                            }", ${pluralize.plural(
                                tableSchema[0].tableNameCamelCase
                            )}, customDmlArgs, context.omnihive);`
                        );
                    }
                });
            } else {
                builder.appendLine(
                    `\t\t\t\t\t\tvar insertResponse = await AwaitHelper.execute(graphParser.parseInsert("${
                        databaseWorker.config.name
                    }", "${tableSchema[0].tableName}", ${pluralize.plural(
                        tableSchema[0].tableNameCamelCase
                    )}, customDmlArgs, context.omnihive));`
                );
            }

            builder.appendLine();

            // After insert custom function
            const afterInsertArray: { worker: RegisteredHiveWorker; order: number }[] = [];

            lifecycleWorkers.forEach((lifecycleWorker: RegisteredHiveWorker) => {
                const metadata: HiveWorkerMetadataLifecycleFunction = lifecycleWorker.metadata as HiveWorkerMetadataLifecycleFunction;
                if (
                    lifecycleWorker.type == HiveWorkerType.DataLifecycleFunction &&
                    metadata.lifecycleStage == LifecycleWorkerStage.After &&
                    metadata.lifecycleAction == LifecycleWorkerAction.Insert &&
                    metadata.lifecycleWorker === databaseWorker.config.name &&
                    metadata.lifecycleTables.some(
                        (lifecycleTable) => lifecycleTable === tableSchema[0].tableName || lifecycleTable === "*"
                    )
                ) {
                    afterInsertArray.push({
                        worker: lifecycleWorker,
                        order: metadata.lifecycleOrder,
                    });
                }
            });

            if (afterInsertArray.length > 0) {
                _.orderBy(afterInsertArray, ["lifecycleOrder"], ["asc"]).forEach((lifecycleWorker) => {
                    builder.appendLine(
                        `\t\t\t\t\t\t${lifecycleWorker.worker.name}Instance = global.omnihive.registeredWorkers.find((worker) => worker.name === "${lifecycleWorker.worker.name}").instance;`
                    );
                    builder.appendLine(
                        `\t\t\t\t\t\t{insertResponse, customDmlArgs} = ${lifecycleWorker.worker.name}Instance("${databaseWorker.config.name}", "${tableSchema[0].tableName}", insertResponse, customDmlArgs, context.omnihive);`
                    );
                });
            }

            builder.appendLine(`\t\t\t\t\t\treturn insertResponse;`);
            builder.appendLine();
            builder.appendLine(`\t\t\t\t\t} catch (err) {`);
            builder.appendLine(`\t\t\t\t\t\tthrow new Error(err);`);
            builder.appendLine(`\t\t\t\t\t}`);
            builder.appendLine(`\t\t\t\t}`);
            builder.appendLine(`\t\t\t},`);

            // Update
            builder.appendLine(`\t\t\tupdate_${pluralize.singular(tableSchema[0].tableNamePascalCase)}: {`);
            builder.appendLine(`\t\t\t\ttype: GraphQLInt,`);
            builder.appendLine(`\t\t\t\targs: {`);
            builder.appendLine(`\t\t\t\t\tcustomDmlArgs: {`);
            builder.appendLine(`\t\t\t\t\t\ttype: GraphQLJSONObject`);
            builder.appendLine(`\t\t\t\t\t},`);
            builder.appendLine(`\t\t\t\t\tupdateObject: {`);
            builder.appendLine(
                `\t\t\t\t\t\ttype: ${pluralize.singular(tableSchema[0].tableNamePascalCase)}MutationType,`
            );
            builder.appendLine(`\t\t\t\t\t},`);
            builder.appendLine(`\t\t\t\t\twhereObject: {`);
            builder.appendLine(
                `\t\t\t\t\t\ttype: ${pluralize.singular(tableSchema[0].tableNamePascalCase)}MutationWhereType,`
            );
            builder.appendLine(`\t\t\t\t\t},`);
            builder.appendLine(`\t\t\t\t},`);
            builder.appendLine(
                `\t\t\t\tresolve: async (parent, { updateObject, whereObject, customDmlArgs }, context, resolveInfo) => {`
            );
            builder.appendLine(`\t\t\t\t\tvar graphParser = new ParseMaster();`);
            builder.appendLine();
            builder.appendLine(`\t\t\t\t\ttry {`);
            builder.appendLine();

            // Before update custom function
            const beforeUpdateArray: { worker: RegisteredHiveWorker; order: number }[] = [];

            lifecycleWorkers.forEach((lifecycleWorker: RegisteredHiveWorker) => {
                const metadata: HiveWorkerMetadataLifecycleFunction = lifecycleWorker.metadata as HiveWorkerMetadataLifecycleFunction;
                if (
                    lifecycleWorker.type == HiveWorkerType.DataLifecycleFunction &&
                    metadata.lifecycleStage == LifecycleWorkerStage.Before &&
                    metadata.lifecycleAction == LifecycleWorkerAction.Update &&
                    metadata.lifecycleWorker === databaseWorker.config.name &&
                    metadata.lifecycleTables.some(
                        (lifecycleTable) => lifecycleTable === tableSchema[0].tableName || lifecycleTable === "*"
                    )
                ) {
                    beforeUpdateArray.push({
                        worker: lifecycleWorker,
                        order: metadata.lifecycleOrder,
                    });
                }
            });

            if (beforeUpdateArray.length > 0) {
                _.orderBy(beforeUpdateArray, ["lifecycleOrder"], ["asc"]).forEach((lifecycleWorker) => {
                    builder.appendLine(
                        `\t\t\t\t\t\t${lifecycleWorker.worker.name}Instance = global.omnihive.registeredWorkers.find((worker) => worker.name === "${lifecycleWorker.worker.name}").instance;`
                    );
                    builder.appendLine(
                        `\t\t\t\t\t\t{updateObject, whereObject, customDmlArgs} = ${lifecycleWorker.worker.name}Instance("${databaseWorker.config.name}", "${tableSchema[0].tableName}", updateObject, whereObject, customDmlArgs, context.omnihive);`
                    );
                });
            }

            builder.appendLine();

            // Instead of update custom function
            const insteadOfUpdateArray: { worker: RegisteredHiveWorker; order: number }[] = [];

            lifecycleWorkers.forEach((lifecycleWorker: RegisteredHiveWorker) => {
                const metadata: HiveWorkerMetadataLifecycleFunction = lifecycleWorker.metadata as HiveWorkerMetadataLifecycleFunction;
                if (
                    lifecycleWorker.type == HiveWorkerType.DataLifecycleFunction &&
                    metadata.lifecycleStage == LifecycleWorkerStage.InsteadOf &&
                    metadata.lifecycleAction == LifecycleWorkerAction.Update &&
                    metadata.lifecycleWorker === databaseWorker.config.name &&
                    metadata.lifecycleTables.some(
                        (lifecycleTable) => lifecycleTable === tableSchema[0].tableName || lifecycleTable === "*"
                    )
                ) {
                    insteadOfUpdateArray.push({
                        worker: lifecycleWorker,
                        order: metadata.lifecycleOrder,
                    });
                }
            });

            if (insteadOfUpdateArray.length > 0) {
                _.orderBy(beforeUpdateArray, ["lifecycleOrder"], ["asc"]).forEach((lifecycleWorker, index) => {
                    builder.appendLine(
                        `\t\t\t\t\t\t${lifecycleWorker.worker.name}Instance = global.omnihive.registeredWorkers.find((worker) => worker.name === "${lifecycleWorker.worker.name}").instance;`
                    );
                    if (index === insteadOfUpdateArray.length - 1) {
                        builder.appendLine(
                            `\t\t\t\t\t\tvar updateCount = ${lifecycleWorker.worker.name}Instance("${databaseWorker.config.name}", "${tableSchema[0].tableName}", updateObject, whereObject, customDmlArgs, context.omnihive);`
                        );
                    } else {
                        builder.appendLine(
                            `\t\t\t\t\t\t{updateObject, whereObject, customDmlArgs} = ${lifecycleWorker.worker.name}Instance("${databaseWorker.config.name}", "${tableSchema[0].tableName}", updateObject, whereObject, customDmlArgs, context.omnihive);`
                        );
                    }
                });
            } else {
                builder.appendLine(
                    `\t\t\t\t\t\tvar updateCount = await AwaitHelper.execute(graphParser.parseUpdate("${databaseWorker.config.name}", "${tableSchema[0].tableName}", updateObject, whereObject, customDmlArgs, context.omnihive));`
                );
            }

            builder.appendLine();

            // After update custom function
            const afterUpdateArray: { worker: RegisteredHiveWorker; order: number }[] = [];

            lifecycleWorkers.forEach((lifecycleWorker: RegisteredHiveWorker) => {
                const metadata: HiveWorkerMetadataLifecycleFunction = lifecycleWorker.metadata as HiveWorkerMetadataLifecycleFunction;
                if (
                    lifecycleWorker.type == HiveWorkerType.DataLifecycleFunction &&
                    metadata.lifecycleStage == LifecycleWorkerStage.After &&
                    metadata.lifecycleAction == LifecycleWorkerAction.Update &&
                    metadata.lifecycleWorker === databaseWorker.config.name &&
                    metadata.lifecycleTables.some(
                        (lifecycleTable) => lifecycleTable === tableSchema[0].tableName || lifecycleTable === "*"
                    )
                ) {
                    afterUpdateArray.push({
                        worker: lifecycleWorker,
                        order: metadata.lifecycleOrder,
                    });
                }
            });

            if (afterUpdateArray.length > 0) {
                _.orderBy(afterUpdateArray, ["lifecycleOrder"], ["asc"]).forEach((lifecycleWorker) => {
                    builder.appendLine(
                        `\t\t\t\t\t\t${lifecycleWorker.worker.name}Instance = global.omnihive.registeredWorkers.find((worker) => worker.name === "${lifecycleWorker.worker.name}").instance;`
                    );
                    builder.appendLine(
                        `\t\t\t\t\t\t{updateCount, customDmlArgs} = ${lifecycleWorker.worker.name}Instance("${databaseWorker.config.name}", "${tableSchema[0].tableName}", updateCount, customDmlArgs, context.omnihive);`
                    );
                });
            }

            builder.appendLine(`\t\t\t\t\t\treturn updateCount;`);
            builder.appendLine();
            builder.appendLine(`\t\t\t\t\t} catch (err) {`);
            builder.appendLine(`\t\t\t\t\t\tthrow new Error(err);`);
            builder.appendLine(`\t\t\t\t\t}`);
            builder.appendLine(`\t\t\t\t}`);
            builder.appendLine(`\t\t\t},`);

            // Delete
            builder.appendLine(`\t\t\tdelete_${pluralize.singular(tableSchema[0].tableNamePascalCase)}: {`);
            builder.appendLine(`\t\t\t\ttype: GraphQLInt,`);
            builder.appendLine(`\t\t\t\targs: {`);
            builder.appendLine(`\t\t\t\t\tcustomDmlArgs: {`);
            builder.appendLine(`\t\t\t\t\t\ttype: GraphQLJSONObject`);
            builder.appendLine(`\t\t\t\t\t},`);
            builder.appendLine(`\t\t\t\t\twhereObject: {`);
            builder.appendLine(
                `\t\t\t\t\t\ttype: ${pluralize.singular(tableSchema[0].tableNamePascalCase)}MutationWhereType,`
            );
            builder.appendLine(`\t\t\t\t\t},`);
            builder.appendLine(`\t\t\t\t},`);
            builder.appendLine(
                `\t\t\t\tresolve: async (parent, { whereObject, customDmlArgs }, context, resolveInfo) => {`
            );
            builder.appendLine(`\t\t\t\t\tvar graphParser = new ParseMaster();`);
            builder.appendLine();
            builder.appendLine(`\t\t\t\t\ttry {`);
            builder.appendLine();

            // Before delete custom function
            const beforeDeleteArray: { worker: RegisteredHiveWorker; order: number }[] = [];

            lifecycleWorkers.forEach((lifecycleWorker: RegisteredHiveWorker) => {
                const metadata: HiveWorkerMetadataLifecycleFunction = lifecycleWorker.metadata as HiveWorkerMetadataLifecycleFunction;
                if (
                    lifecycleWorker.type == HiveWorkerType.DataLifecycleFunction &&
                    metadata.lifecycleStage == LifecycleWorkerStage.Before &&
                    metadata.lifecycleAction == LifecycleWorkerAction.Delete &&
                    metadata.lifecycleWorker === databaseWorker.config.name &&
                    metadata.lifecycleTables.some(
                        (lifecycleTable) => lifecycleTable === tableSchema[0].tableName || lifecycleTable === "*"
                    )
                ) {
                    beforeDeleteArray.push({
                        worker: lifecycleWorker,
                        order: metadata.lifecycleOrder,
                    });
                }
            });

            if (beforeDeleteArray.length > 0) {
                _.orderBy(beforeDeleteArray, ["lifecycleOrder"], ["asc"]).forEach((lifecycleWorker) => {
                    builder.appendLine(
                        `\t\t\t\t\t\t${lifecycleWorker.worker.name}Instance = global.omnihive.registeredWorkers.find((worker) => worker.name === "${lifecycleWorker.worker.name}").instance;`
                    );
                    builder.appendLine(
                        `\t\t\t\t\t\t{whereObject, customDmlArgs} = ${lifecycleWorker.worker.name}Instance("${databaseWorker.config.name}", "${tableSchema[0].tableName}", whereObject, customDmlArgs, context.omnihive);`
                    );
                });
            }

            builder.appendLine();

            // Instead of delete custom function
            const insteadOfDeleteArray: { worker: RegisteredHiveWorker; order: number }[] = [];

            lifecycleWorkers.forEach((lifecycleWorker: RegisteredHiveWorker) => {
                const metadata: HiveWorkerMetadataLifecycleFunction = lifecycleWorker.metadata as HiveWorkerMetadataLifecycleFunction;
                if (
                    lifecycleWorker.type == HiveWorkerType.DataLifecycleFunction &&
                    metadata.lifecycleStage == LifecycleWorkerStage.InsteadOf &&
                    metadata.lifecycleAction == LifecycleWorkerAction.Delete &&
                    metadata.lifecycleWorker === databaseWorker.config.name &&
                    metadata.lifecycleTables.some(
                        (lifecycleTable) => lifecycleTable === tableSchema[0].tableName || lifecycleTable === "*"
                    )
                ) {
                    insteadOfDeleteArray.push({
                        worker: lifecycleWorker,
                        order: metadata.lifecycleOrder,
                    });
                }
            });

            if (insteadOfDeleteArray.length > 0) {
                _.orderBy(insteadOfDeleteArray, ["lifecycleOrder"], ["asc"]).forEach((lifecycleWorker, index) => {
                    builder.appendLine(
                        `\t\t\t\t\t\t${lifecycleWorker.worker.name}Instance = global.omnihive.registeredWorkers.find((worker) => worker.name === "${lifecycleWorker.worker.name}").instance;`
                    );
                    if (index === insteadOfDeleteArray.length - 1) {
                        builder.appendLine(
                            `\t\t\t\t\t\tvar deleteCount = ${lifecycleWorker.worker.name}Instance("${databaseWorker.config.name}", "${tableSchema[0].tableName}", whereObject, customDmlArgs, context.omnihive);`
                        );
                    } else {
                        builder.appendLine(
                            `\t\t\t\t\t\t{whereObject, customDmlArgs} = ${lifecycleWorker.worker.name}Instance("${databaseWorker.config.name}", "${tableSchema[0].tableName}", whereObject, customDmlArgs, context.omnihive);`
                        );
                    }
                });
            } else {
                builder.appendLine(
                    `\t\t\t\t\t\tvar deleteCount = await AwaitHelper.execute(graphParser.parseDelete("${databaseWorker.config.name}", "${tableSchema[0].tableName}", whereObject, customDmlArgs, context.omnihive));`
                );
            }

            builder.appendLine();

            // After delete custom function
            const afterDeleteArray: { worker: RegisteredHiveWorker; order: number }[] = [];

            lifecycleWorkers.forEach((lifecycleWorker: RegisteredHiveWorker) => {
                const metadata: HiveWorkerMetadataLifecycleFunction = lifecycleWorker.metadata as HiveWorkerMetadataLifecycleFunction;
                if (
                    lifecycleWorker.type == HiveWorkerType.DataLifecycleFunction &&
                    metadata.lifecycleStage == LifecycleWorkerStage.After &&
                    metadata.lifecycleAction == LifecycleWorkerAction.Delete &&
                    metadata.lifecycleWorker === databaseWorker.config.name &&
                    metadata.lifecycleTables.some(
                        (lifecycleTable) => lifecycleTable === tableSchema[0].tableName || lifecycleTable === "*"
                    )
                ) {
                    afterDeleteArray.push({
                        worker: lifecycleWorker,
                        order: metadata.lifecycleOrder,
                    });
                }
            });

            if (afterDeleteArray.length > 0) {
                _.orderBy(afterDeleteArray, ["lifecycleOrder"], ["asc"]).forEach((lifecycleWorker) => {
                    builder.appendLine(
                        `\t\t\t\t\t\t${lifecycleWorker.worker.name}Instance = global.omnihive.registeredWorkers.find((worker) => worker.name === "${lifecycleWorker.worker.name}").instance;`
                    );
                    builder.appendLine(
                        `\t\t\t\t\t{deleteCount, customDmlArgs} = ${lifecycleWorker.worker.name}Instance("${databaseWorker.config.name}", "${tableSchema[0].tableName}", deleteCount, customDmlArgs, context.omnihive);`
                    );
                });
            }

            builder.appendLine(`\t\t\t\t\t\treturn deleteCount;`);
            builder.appendLine();
            builder.appendLine(`\t\t\t\t\t} catch (err) {`);
            builder.appendLine(`\t\t\t\t\t\tthrow new Error(err);`);
            builder.appendLine(`\t\t\t\t\t}`);
            builder.appendLine(`\t\t\t\t}`);
            builder.appendLine(`\t\t\t},`);
        });

        builder.appendLine(`\t\t})`);
        builder.appendLine(`\t})`);
        builder.appendLine(`});`);

        builder.appendLine();

        // Build stored proc object if they exist
        if (connectionSchema.storedProcs.length > 0) {
            // Stored proc object type
            builder.appendLine(`var StoredProcObjectType = new GraphQLObjectType({`);
            builder.appendLine(`\tname: 'storedProcedures',`);
            builder.appendLine(`\tfields: () => ({`);

            // Build all stored procedures as graph fields

            const storedProcedures = _.uniqBy(connectionSchema.storedProcs, "storedProcName");

            storedProcedures.forEach((proc: StoredProcSchema) => {
                builder.appendLine(`\t\t${proc.storedProcName}: {`);
                builder.appendLine(`\t\t\ttype: GraphQLJSONObject,`);
                builder.appendLine(`\t\t\targs: {`);
                connectionSchema.storedProcs
                    .filter(
                        (arg: StoredProcSchema) =>
                            arg.schema === proc.schema && arg.storedProcName === proc.storedProcName
                    )
                    .forEach((arg: StoredProcSchema) => {
                        if (arg.parameterName) {
                            builder.append(`\t\t\t\t${arg.parameterName.replace("@", "")}: { type : `);

                            switch (arg.parameterTypeEntity) {
                                case "string":
                                    builder.append(`GraphQLString`);
                                    break;
                                case "number":
                                    builder.append(`GraphQLInt`);
                                    break;
                                case "boolean":
                                    builder.append(`GraphQLBoolean`);
                                    break;
                                case "Date":
                                    builder.append(`GraphQLString`);
                                    break;
                                default:
                                    builder.append(`GraphQLString`);
                                    break;
                            }

                            builder.appendLine(` },`);
                        }
                    });
                builder.appendLine(`\t\t\t},`);
                builder.appendLine(`\t\t},`);
            });

            builder.appendLine(`\t})`);
            builder.appendLine(`});`);

            builder.appendLine();

            // Stored proc schema type
            builder.appendLine(`exports.FederatedGraphStoredProcSchema = new GraphQLSchema({`);
            builder.appendLine(`\tquery: new GraphQLObjectType({`);
            builder.appendLine(`\t\tname: 'Query',`);
            builder.appendLine(`\t\tfields: () => ({`);
            builder.appendLine(`\t\t\tstoredProcedures: {`);
            builder.appendLine(`\t\t\t\ttype: new GraphQLList(StoredProcObjectType),`);
            builder.appendLine(`\t\t\t\tresolve: async (parent, args, context, resolveInfo) => {`);
            builder.appendLine(`\t\t\t\t\tvar graphParser = new ParseMaster();`);
            builder.appendLine(
                `\t\t\t\t\tvar dbResponses = await AwaitHelper.execute(graphParser.parseStoredProcedure("${databaseWorker.config.name}", resolveInfo, context.omnihive));`
            );
            builder.appendLine(`\t\t\t\t\tfor (const item of dbResponses) {`);
            builder.appendLine(`\t\t\t\t\t\t\tdbResponses[item.procName] = item.results;`);
            builder.appendLine(`\t\t\t\t\t}`);
            builder.appendLine(`\t\t\t\t\treturn [dbResponses];`);
            builder.appendLine(`\t\t\t\t},`);
            builder.appendLine(`\t\t\t},`);
            builder.appendLine(`\t\t})`);
            builder.appendLine(`\t}),`);
            builder.appendLine(`});`);

            builder.appendLine();
        }

        return builder.outputString();
    };
}
