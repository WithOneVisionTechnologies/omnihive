import { FieldNode, GraphQLResolveInfo } from "graphql";
import { GraphContext } from "@withonevision/omnihive-core/models/GraphContext";
import { TableSchema } from "@withonevision/omnihive-core/models/TableSchema";
import { Knex } from "knex";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { ICacheWorker } from "@withonevision/omnihive-core/interfaces/ICacheWorker";
import { IDatabaseWorker } from "@withonevision/omnihive-core/interfaces/IDatabaseWorker";
import { IDateWorker } from "@withonevision/omnihive-core/interfaces/IDateWorker";
import { IEncryptionWorker } from "@withonevision/omnihive-core/interfaces/IEncryptionWorker";
import { ILogWorker } from "@withonevision/omnihive-core/interfaces/ILogWorker";
import { GraphHelper } from "../helpers/GraphHelper";
import { CacheHelper } from "../helpers/CacheHelper";
import { IsHelper } from "src/packages/omnihive-core/helpers/IsHelper";
import { Path } from "graphql/jsutils/Path";
import { WorkerHelper } from "../helpers/WorkerHelper";
import { DatabaseHelper } from "../helpers/DatabaseHelper";

export class ParseAggregate {
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
    private fieldAliasMap: { name: string; alias: string }[] = [];

    // Static Values
    private aggregateFieldSuffix: string = "_aggregate";

    public parse = async (
        workerName: string,
        _args: any,
        resolveInfo: GraphQLResolveInfo,
        omniHiveContext: GraphContext,
        schema: { [tableName: string]: TableSchema[] }
    ): Promise<any> => {
        try {
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
        this.parentCall = this.findParentNames(resolveInfo.path, resolveInfo.fieldNodes, this.aggregateFieldSuffix);

        const topParent: { key: string; alias: string } | undefined = this.findParentNames(
            resolveInfo.path,
            resolveInfo.operation.selectionSet.selections as readonly FieldNode[]
        );

        if (topParent && this.parentCall) {
            // Generate the query structure from the graph object for the current parent value
            this.queryStructure = this.graphHelper.buildQueryStructure(
                resolveInfo.operation.selectionSet.selections as FieldNode[],
                this.parentCall,
                0,
                [],
                topParent.key,
                this.schema
            );
        }

        // Iterate through each query structure's parent value found
        Object.keys(this.queryStructure).forEach((key) => {
            // If this key is not the current parent of the aggregate being calculated
            if (key !== topParent?.key && key !== topParent?.alias) {
                // Skip
                return;
            }

            // If the builder was not initialized properly throw an error
            if (!this.builder) {
                throw new Error("Knex Query Builder did not initialize correctly");
            }

            if (!topParent) {
                throw new Error("Query Structure was not formed properly");
            }

            const tableKey: string = this.queryStructure[key].queryKey;

            // Retrieve the parent values TableSchema values
            const tableSchema: TableSchema[] = this.schema[tableKey];
            this.builder?.from(`${tableSchema[0].tableName} as t1`);

            // Build queries for the current query structure
            this.graphToKnex(this.queryStructure[key], topParent.key, key);

            // Build the aggregate section of the query
            this.buildAggregateCall(this.queryStructure);
        });
    };

    /**
     * Find the bottom key value or the first key of the matching suffix
     *
     * @param path
     * @param suffixType
     * @returns { string }
     */
    private findParentNames = (
        path: Path,
        selections: readonly FieldNode[],
        suffixType: string = ""
    ): { key: string; alias: string } | undefined => {
        const result: { key: string; alias: string } = { key: path.key.toString(), alias: "" };

        // Retrieve real query property name
        const queryPropName: string = this.graphHelper.findFieldNameFromAlias(selections, path.key.toString());

        // If no name was found then the graph object is not structured properly
        if (!queryPropName) {
            return undefined;
        }

        if (result.key !== queryPropName) {
            result.alias = result.key;
            result.key = queryPropName;
        }

        // If the suffixes match then this is the value we are searching for
        if (suffixType && result.key.endsWith(suffixType)) {
            result.key = result.key.replace(suffixType, "");
            return result;
        }

        // If the next value is blank then this is the top most value
        if (!path.prev?.key.toString()) {
            return result;
        }

        // Graph tends to put important data every other entry
        // so skip to the next important entry if it exists
        if (path.prev.prev?.key) {
            return this.findParentNames(path.prev.prev, selections, suffixType);
        }

        return this.findParentNames(path.prev, selections, suffixType);
    };

    /**
     * Convert a graph query to a knex database call
     *
     * @param structure
     * @param structureKey TableSchema object key
     * @param queryKey GraphQL Query object key
     * @returns { void }
     */
    private graphToKnex = (structure: any, structureKey: string, topParent: string): any => {
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

        const databaseHelper: DatabaseHelper = new DatabaseHelper();

        // Build the joining values
        databaseHelper.buildJoins(
            this.builder,
            structure,
            structureKey,
            structure.queryKey,
            this.schema,
            this.knex,
            this.queryStructure,
            topParent
        );

        // if arguments exist on the structure level and are not a join that is set to specific
        //  then build the conditional query specifications
        if (!structure.args?.join || !structure.args?.join?.whereMode || structure.args.join.whereMode === "global") {
            databaseHelper.buildConditions(
                structure.args,
                structure.tableAlias,
                this.builder,
                structureKey.replace(this.aggregateFieldSuffix, ""),
                this.schema,
                this.knex
            );
        }

        // Iterate through each graph sub-query to recursively build the database query
        Object.keys(structure).forEach((key) => {
            // Build inner queries
            if (structure[key].args?.join) {
                this.graphToKnex(structure[key], structure[key].tableKey, topParent);
            }
        });
    };

    /**
     * Build the aggregate section of the query
     *
     * @param aggregate
     * @returns { void }
     */
    private buildAggregateCall = (structure: any): void => {
        Object.keys(structure).forEach((key) => {
            if (structure[key].aggregate) {
                // Iterate through each aggregate function
                structure[key].columns.forEach((agg: { name: string; alias: string; dbName: string; args: any }) => {
                    // If the builder is not initialized then throw an error
                    if (!this.builder) {
                        throw new Error("Knex Query Builder is not initialized");
                    }

                    // If no arguments were found then throw an error
                    if (!agg.args) {
                        throw new Error("Argument missing from aggregate function");
                    }

                    // If this field is for the currently executing query then add it to the map
                    if (
                        this.parentCall &&
                        (this.parentCall?.alias === key ||
                            (this.parentCall?.alias.length <= 0 && this.parentCall?.key === key))
                    ) {
                        // Populate alias list for hydration
                        this.fieldAliasMap.push({ name: agg.name, alias: agg.alias });

                        // Build aggregate function arguments so alias is used on the query return
                        const aggArgument: any = { [agg.alias]: `${structure[key].tableAlias}.${agg.dbName}` };

                        // Add the aggregate function
                        switch (agg.name) {
                            case "count":
                                if (agg.args.distinct) {
                                    this.builder.countDistinct(aggArgument);
                                } else {
                                    this.builder.count(aggArgument);
                                }
                                break;
                            case "max":
                                this.builder?.max(aggArgument);
                                break;
                            case "min":
                                this.builder?.min(aggArgument);
                                break;
                            case "sum":
                                if (agg.args.distinct) {
                                    this.builder.sumDistinct(aggArgument);
                                } else {
                                    this.builder?.count(aggArgument);
                                }
                                break;
                            case "avg":
                                if (agg.args.distinct) {
                                    this.builder.avgDistinct(aggArgument);
                                } else {
                                    this.builder?.avg(aggArgument);
                                }
                                break;
                        }
                    }
                });
            } else if (structure[key].tableAlias) {
                this.buildAggregateCall(structure[key]);
            }
        });
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
            if (results) {
                const graphResult = this.dbResultToGraph(results[0]);
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

    private dbResultToGraph = (results: any) => {
        // Initialize Return object
        const graphObject: any = {};

        // Process results
        for (const item of results) {
            Object.keys(item).forEach((key) => {
                const graphKey = this.fieldAliasMap.find((x) => x.alias === key)?.name;
                let value = item[key];

                if (IsHelper.isDate(value) && this.dateWorker) {
                    value = this.dateWorker.getFormattedDateString(value);
                }

                if (graphKey) {
                    graphObject[graphKey] = value;
                }
            });
        }

        return graphObject;
    };
}
