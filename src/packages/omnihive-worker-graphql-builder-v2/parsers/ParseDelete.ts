import { GraphContext } from "@withonevision/omnihive-core/models/GraphContext";
import { TableSchema } from "@withonevision/omnihive-core/models/TableSchema";
import { Knex } from "knex";
import { IDatabaseWorker } from "@withonevision/omnihive-core/interfaces/IDatabaseWorker";
import { IDateWorker } from "@withonevision/omnihive-core/interfaces/IDateWorker";
import { GraphHelper } from "../helpers/GraphHelper";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { WorkerHelper } from "../helpers/WorkerHelper";
import { DatabaseHelper } from "../helpers/DatabaseHelper";

export class ParseDelete {
    // Workers
    private databaseWorker: IDatabaseWorker | undefined;
    private dateWorker: IDateWorker | undefined;

    // Helpers
    private graphHelper: GraphHelper = new GraphHelper();

    // Global Variables
    private schema: { [tableName: string]: TableSchema[] } = {};
    private knex: Knex | undefined;
    private builder: Knex.QueryBuilder<any, unknown[]> | undefined;

    /**
     * Parse the GraphQL Mutation
     *
     * @param workerName
     * @param tableKey
     * @param args
     * @param omniHiveContext
     * @param schema
     * @returns { Promise<number> }
     */
    public parse = async (
        workerName: string,
        tableKey: string,
        args: any,
        omniHiveContext: GraphContext,
        schema: { [tableName: string]: TableSchema[] }
    ): Promise<number> => {
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

            // Retrieve the TableSchema values fro the parent table
            const schemaColumns: TableSchema[] = this.schema[tableKey];

            // Determine a proper value to return for the count
            let countingColumn = schemaColumns.find((x) => x.columnIsPrimaryKey);
            if (!countingColumn) {
                countingColumn = schemaColumns[0];
            }

            // Build a mock structure for the hydrator to run against
            const mockStructure = {
                args: args,
                columns: [
                    {
                        name: countingColumn.columnNameEntity,
                        alias: "f0",
                        dbName: countingColumn.columnNameDatabase,
                    },
                ],
            };

            if (countingColumn) {
                // Build the delete query
                this.buildProc(args, tableKey, countingColumn.columnNameDatabase, schemaColumns[0].tableName);

                if (this.builder && this.databaseWorker) {
                    // Run the delete query
                    const dbResults = await AwaitHelper.execute(
                        this.databaseWorker.executeQuery(this.builder.toString())
                    );

                    // Hydrate the database response
                    const graphResults = this.graphHelper.buildGraphReturn(
                        mockStructure,
                        dbResults[0],
                        this.dateWorker,
                        false
                    );

                    // Return the count of the items deleted
                    return graphResults.length;
                }
            }

            // If this point is reached then nothing was deleted
            return 0;
        } catch (err) {
            throw err;
        }
    };

    /**
     * Build the delete query
     *
     * @param args
     * @param tableKey
     * @param columnName
     * @returns { void }
     */
    private buildProc = (args: any, structureKey: string, columnName: string, tableName: string): void => {
        // Initialize the builder
        if (!this.knex) {
            throw new Error("Knex object is not initialized");
        }
        this.builder = this.knex.queryBuilder();

        // Set primary table
        this.builder.from(`${tableName}`);

        // Build the conditions for the delete query
        const databaseHelper: DatabaseHelper = new DatabaseHelper();
        databaseHelper.buildConditions(args, "", this.builder, structureKey, this.schema, this.knex);

        // Set the delete command the the designated return column
        this.builder.delete([columnName], { includeTriggerModifications: true });
    };
}
