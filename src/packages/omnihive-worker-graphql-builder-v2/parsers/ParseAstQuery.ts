/// <reference path="../../../types/globals.omnihive.d.ts" />

import { FieldNode, GraphQLResolveInfo } from "graphql";
import { GraphContext } from "@withonevision/omnihive-core/models/GraphContext";
import { ILogWorker } from "@withonevision/omnihive-core/interfaces/ILogWorker";
import { IDatabaseWorker } from "@withonevision/omnihive-core/interfaces/IDatabaseWorker";
import { IEncryptionWorker } from "@withonevision/omnihive-core/interfaces/IEncryptionWorker";
import { ICacheWorker } from "@withonevision/omnihive-core/interfaces/ICacheWorker";
import { IDateWorker } from "@withonevision/omnihive-core/interfaces/IDateWorker";
import { Knex } from "knex";
import { TableSchema } from "@withonevision/omnihive-core/models/TableSchema";
import { GraphHelper } from "../helpers/GraphHelper";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { CacheHelper } from "../helpers/CacheHelper";
import { WorkerHelper } from "../helpers/WorkerHelper";
import { DatabaseHelper } from "../helpers/DatabaseHelper";

export class ParseAstQuery {
    // Workers
    private logWorker: ILogWorker | undefined;
    private databaseWorker: IDatabaseWorker | undefined;
    private encryptionWorker: IEncryptionWorker | undefined;
    private cacheWorker!: ICacheWorker | undefined;
    private dateWorker!: IDateWorker | undefined;

    // Helpers
    private graphHelper: GraphHelper = new GraphHelper();

    // Global Values
    private knex: Knex | undefined;
    private builder: Knex.QueryBuilder<any, unknown[]> | undefined;
    private queryStructure: any = {};
    private schema: { [tableName: string]: TableSchema[] } = {};
    private parentCall: { key: string; alias: string } | undefined;
    private selectionFields: TableSchema[] = [];
    private fieldAliasMap: { name: string; alias: string }[] = [];

    // Static Values
    private aggregateFieldSuffix: string = "_aggregate";

    /**
     * Parse a GraphQL query into a database query and return the results to graph
     *
     * @param workerName
     * @param _args
     * @param resolveInfo
     * @param omniHiveContext
     * @param schema
     * @returns { Promise<any> }
     */
    public parse = async (
        workerName: string,
        _args: any,
        resolveInfo: GraphQLResolveInfo,
        omniHiveContext: GraphContext,
        schema: { [tableName: string]: TableSchema[] }
    ): Promise<any> => {
        try {
            if (resolveInfo.fieldName.endsWith(this.aggregateFieldSuffix)) {
                return [];
            }

            // Store the schema for global use
            this.schema = schema;

            // Set the required worker values
            const workerHelper: WorkerHelper = new WorkerHelper();
            const { logWorker, databaseWorker, knex, encryptionWorker, cacheWorker, dateWorker } =
                workerHelper.getRequiredWorkers(workerName);

            // If the database worker does not exist then throw an error
            if (!databaseWorker) {
                throw new Error(
                    "Database Worker Not Defined.  This graph converter will not work without a Database worker."
                );
            }

            this.logWorker = logWorker;
            this.databaseWorker = databaseWorker;
            this.knex = knex;
            this.encryptionWorker = encryptionWorker;
            this.cacheWorker = cacheWorker;
            this.dateWorker = dateWorker;

            // Verify the authenticity of the access token
            await AwaitHelper.execute(workerHelper.verifyToken(omniHiveContext));

            // Build the database query
            this.buildQuery(resolveInfo);

            // Process the built query
            return await AwaitHelper.execute(this.processQuery(workerName, omniHiveContext));
        } catch (err) {
            throw err;
        }
    };

    /**
     * Build the database query from the graph query
     *
     * @param resolveInfo GraphQL Query Object
     * @returns { void }
     */
    private buildQuery = (resolveInfo: GraphQLResolveInfo): void => {
        // If the knex object is not set then throw an error
        if (!this.knex) {
            throw new Error("Knex object is not initialized");
        }

        // Create the query builder
        this.builder = this.knex.queryBuilder();

        // Retrieve the primary table being accessed
        this.parentCall = {
            key: resolveInfo.fieldNodes[0].name.value,
            alias: resolveInfo.fieldNodes[0].alias?.value ?? "",
        };

        // Generate the query structure from the graph object for the current parent value
        this.queryStructure = this.graphHelper.buildQueryStructure(
            resolveInfo.fieldNodes.filter((x) => (x as FieldNode).name.value === this.parentCall?.key) as FieldNode[],
            this.parentCall,
            0,
            this.fieldAliasMap,
            this.parentCall.key,
            this.schema
        );

        // Iterate through each query structure's parent value found
        Object.keys(this.queryStructure).forEach((key) => {
            // Retrieve the database schema key value
            const dbKey: string = this.queryStructure[key].queryKey;

            // If the builder was not initialized properly throw an error
            if (!this.builder) {
                throw new Error("Knex Query Builder did not initialize correctly");
            }

            // Retrieve the parent values TableSchema values
            const tableSchema: TableSchema[] = this.schema[dbKey];
            this.builder.limit(this.databaseWorker?.metadata.rowLimit ?? 10000);
            this.builder?.from(`${tableSchema[0].tableName} as t1`);

            if (this.parentCall) {
                // Build queries for the current query structure
                this.graphToKnex(this.queryStructure[key], this.parentCall.key, key);
            }
        });
    };

    /**
     * Convert the generated structure into a knex query
     *
     * @param structure Structure of the graph query object
     * @param parentKey Parent key of the calling structure level
     * @param queryKey Structure's key for joining to foreign tables from the parent table
     * @returns { void }
     */
    private graphToKnex = (structure: any, parentKey: string, masterKey: string): void => {
        // If the query builder is not initialized properly then throw an error
        if (!this.builder) {
            throw new Error("Knex Query Builder not initialized");
        }

        if (!this.knex) {
            throw new Error("Knex not initialized");
        }

        // If the query structure is not built properly then throw an error
        if (!structure || Object.keys(structure).length <= 0) {
            throw new Error("The Graph Query is not structured properly");
        }

        // Build the select values
        this.buildSelect(structure.columns, structure.tableAlias, parentKey);

        const databaseHelper: DatabaseHelper = new DatabaseHelper();

        if (this.parentCall) {
            // Build the joining values
            databaseHelper.buildJoins(
                this.builder,
                structure,
                parentKey,
                structure.queryKey,
                this.schema,
                this.knex,
                this.queryStructure,
                masterKey
            );
        }

        // if arguments exist on the structure level and are not a join that is set to specific
        //  then build the conditional query specifications
        if (
            !structure.args?.join ||
            (structure.args?.join?.whereMode && structure.args?.join?.whereMode === "global")
        ) {
            databaseHelper.buildConditions(
                structure.args,
                structure.tableAlias,
                this.builder,
                parentKey,
                this.schema,
                this.knex
            );
        }

        // Iterate through each graph sub-query to recursively build the database query
        Object.keys(structure).forEach((key) => {
            // Build inner queries
            if (structure[key].args?.join) {
                this.graphToKnex(structure[key], structure[key].tableKey, masterKey);
            }
        });
    };

    /**
     * Build the select segment of the database query
     *
     * @param columns Column object containing the entity name and the alias the column should be given
     * @param tableAlias The table alias of the columns parent table
     * @param tableName The entity name of the parent table
     */
    private buildSelect = (columns: { name: string; alias: string }[], tableAlias: string, tableName: string): void => {
        // If the columns object exists
        if (columns) {
            // Iterate through each column item to build the select segment of the database query
            columns.forEach((field) => {
                // Find the TableSchema object of the given table
                const column = this.schema[tableName].find((column) => column.columnNameEntity === field.name);

                // If the TableSchema is found and is not already in the database query then add the column to the query
                if (column && !this.selectionFields.some((x) => x.columnNameEntity === column.columnNameEntity)) {
                    // Save the column to the global variable for comparison
                    this.selectionFields.push(column);

                    this.builder?.distinct(`${tableAlias}.${column.columnNameDatabase} as ${field.alias}`);
                }
            });
        }
    };

    /**
     * Process the query that was generated
     *
     * @param workerName
     * @param omniHiveContext
     * @returns { Promise<any> }
     */
    private processQuery = async (workerName: string, omniHiveContext: any): Promise<any> => {
        // If the database query builder exists
        if (this.builder) {
            const cacheHelper: CacheHelper = new CacheHelper(this.cacheWorker, this.logWorker, this.encryptionWorker);
            const sql = this.builder.toString();

            cacheHelper.updateCacheValues(omniHiveContext, workerName, sql);

            // Check the cache to see if results are stored
            let results: any = await AwaitHelper.execute(cacheHelper.checkCache(workerName, omniHiveContext, sql));

            // If results are not stored in the cache run the query
            if (!results && this.databaseWorker) {
                // Execute the database queries
                results = await AwaitHelper.execute(this.databaseWorker.executeQuery(sql));
            }

            // If results are returned then hydrate the results back into graph
            if (results && this.parentCall) {
                let topKey: string = this.parentCall.key;
                if (this.parentCall.alias) {
                    topKey = this.parentCall.alias;
                }
                let graphResult = this.graphHelper.buildGraphReturn(
                    this.queryStructure[topKey],
                    results[0],
                    this.dateWorker
                );

                // Store the results in the cache
                await AwaitHelper.execute(cacheHelper.setCache(workerName, omniHiveContext, sql, graphResult));

                // Return the results
                return graphResult;
            }

            // If this point is reached an error occurred on the parsing of the sql results
            return {
                error: "An unexpected error occurred when transforming the database results back into the graph object structure",
            };
        }
    };
}
