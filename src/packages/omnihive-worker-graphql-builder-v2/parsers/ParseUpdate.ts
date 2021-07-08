import { GraphQLResolveInfo } from "graphql";
import { GraphContext } from "@withonevision/omnihive-core/models/GraphContext";
import { TableSchema } from "@withonevision/omnihive-core/models/TableSchema";
import { GraphHelper } from "../helpers/GraphHelper";
import { IDatabaseWorker } from "@withonevision/omnihive-core/interfaces/IDatabaseWorker";
import { IDateWorker } from "@withonevision/omnihive-core/interfaces/IDateWorker";
import { Knex } from "knex";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { WorkerHelper } from "../helpers/WorkerHelper";
import { DatabaseHelper } from "../helpers/DatabaseHelper";

export class ParseUpdate {
    // Workers
    private databaseWorker: IDatabaseWorker | undefined;
    private dateWorker: IDateWorker | undefined;

    // Helpers
    private graphHelper: GraphHelper = new GraphHelper();

    // Global Variables
    private knex: Knex | undefined;
    private builder: Knex.QueryBuilder<any, unknown[]> | undefined;
    private schema: { [tableName: string]: TableSchema[] } = {};
    private aliasKeyMapping: { name: string; alias: string }[] = [];

    /**
     * Parse the GraphQL Mutation
     *
     * @param workerName
     * @param tableKey
     * @param resolveInfo
     * @param _omniHiveContext
     * @param schema
     * @returns { Promise<any[]> }
     */
    public parse = async (
        workerName: string,
        tableKey: string,
        resolveInfo: GraphQLResolveInfo,
        omniHiveContext: GraphContext,
        schema: { [tableName: string]: TableSchema[] }
    ): Promise<any[]> => {
        try {
            this.schema = schema;

            // Set the required worker values
            const workerHelper: WorkerHelper = new WorkerHelper();
            const { databaseWorker, knex, dateWorker } = workerHelper.getRequiredWorkers(workerName);

            // If the database worker does not exist then throw an error
            if (!databaseWorker) {
                throw new Error(
                    "Database Worker Not Defined.  This graph converter will not work without a Database worker."
                );
            }

            this.databaseWorker = databaseWorker;
            this.knex = knex;
            this.dateWorker = dateWorker;

            // Verify the authenticity of the access token
            await AwaitHelper.execute(workerHelper.verifyToken(omniHiveContext));

            // Build the mutation structure object
            const structure = this.graphHelper.buildQueryStructure(
                resolveInfo.fieldNodes,
                { key: tableKey, alias: "" },
                0,
                this.aliasKeyMapping,
                tableKey,
                this.schema
            );

            // Build the database proc
            this.buildProc(structure, tableKey);

            // Execute the proc
            if (this.databaseWorker && this.builder) {
                const results: any = await AwaitHelper.execute(
                    this.databaseWorker.executeQuery(this.builder.toString())
                );

                const parentAlias: string | undefined = resolveInfo.fieldNodes[0].alias?.value;

                // Convert the database proc return back into it's graph equivalent
                const graphReturn: any = this.graphHelper.buildGraphReturn(
                    structure[parentAlias ?? tableKey],
                    results[0],
                    this.dateWorker,
                    false
                );

                // Return results
                return graphReturn;
            }

            // If this point is reached an error occurred on the parsing of the sql results
            return [
                {
                    error: "An unexpected error occurred when transforming the database results back into the graph object structure",
                },
            ];
        } catch (err) {
            throw err;
        }
    };

    private buildProc = (structure: any, tableKey: string): void => {
        if (!this.knex) {
            throw new Error("Knex object is not initialized");
        }

        this.builder = this.knex.queryBuilder();

        const columns = this.schema[tableKey];
        const tableDbName = columns[0].tableName;

        for (const key in structure) {
            this.builder.from(tableDbName);

            const databaseHelper: DatabaseHelper = new DatabaseHelper();
            databaseHelper.buildConditions(structure[key].args, "", this.builder, tableKey, this.schema, this.knex);

            if (structure[key]?.args?.updateTo) {
                const dbObject = databaseHelper.convertEntityObjectToDbObject(structure[key].args.updateTo, columns);
                const returnArray = structure[key].columns.map(
                    (x: { name: string; alias: string; dbName: string }) => x.dbName
                );

                this.builder.update(dbObject, returnArray, { includeTriggerModifications: true });
            }
        }
    };
}
