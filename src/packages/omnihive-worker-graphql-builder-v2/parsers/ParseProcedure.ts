import { FieldNode, GraphQLResolveInfo, ListValueNode, ObjectFieldNode, ObjectValueNode } from "graphql";
import { GraphContext } from "@withonevision/omnihive-core/models/GraphContext";
import { ProcFunctionSchema } from "@withonevision/omnihive-core/models/ProcFunctionSchema";
import { IDatabaseWorker } from "@withonevision/omnihive-core/interfaces/IDatabaseWorker";
import { AwaitHelper } from "src/packages/omnihive-core/helpers/AwaitHelper";
import { WorkerHelper } from "../helpers/WorkerHelper";

export class ParseProcedure {
    // Workers
    private databaseWorker: IDatabaseWorker | undefined;

    // Global Variables

    public parse = async (
        workerName: string,
        resolveInfo: GraphQLResolveInfo,
        omniHiveContext: GraphContext,
        procedureData: ProcFunctionSchema[]
    ): Promise<any[][]> => {
        // Set the required worker values
        const workerHelper: WorkerHelper = new WorkerHelper();
        const { databaseWorker } = workerHelper.getRequiredWorkers(workerName);

        // If the database worker does not exist then throw an error
        if (!databaseWorker) {
            throw new Error(
                "Database Worker Not Defined.  This graph converter will not work without a Database worker."
            );
        }

        this.databaseWorker = databaseWorker;

        // Verify the authenticity of the access token
        await AwaitHelper.execute(workerHelper.verifyToken(omniHiveContext));

        const structure: any = this.buildQueryStructure(resolveInfo.fieldNodes, procedureData);

        if (this.databaseWorker) {
            const results: any = {};

            for (const proc in structure) {
                return await AwaitHelper.execute(
                    this.databaseWorker.executeProcedure(procedureData, structure[proc].args)
                );
            }

            return results;
        }

        return [];
    };

    /**
     * Generate a query structure from the graph query
     *
     * Structure Def:
     *      {
     *          [procName: string]: {
     *              [childStructure: string]: Recursive Structure Def,
     *              columns: { name: string, alias: string },
     *              tableKey: string (camel case name of database table),
     *              tableAlias: string (database query alias),
     *              parentTableKey: string (camel case name of database table this object is linking from),
     *              linkingTableKey: string (camel case name of database table this object is linking to),
     *              args: any (arguments declared in graph),
     *          }
     *      }
     *
     * @param graphField Selection Field Nodes from the GraphQL Query Object
     * @param parentKey Current fields parent key
     * @param tableCount Current number of tables being joined upon
     * @param aliasKeys Alias keys of columns being selected
     * @returns { any }
     */
    private buildQueryStructure = (graphField: readonly FieldNode[], procData: ProcFunctionSchema[]): any => {
        const schemaName = `${procData[0].schemaName}_`;

        // Initiate default object
        let structure: any = {};

        // Iterate through each field in the selection node
        graphField.forEach((field) => {
            const key = field.name.value.replace(schemaName, "");

            if (!structure[key]) {
                structure[key] = {};
            }

            // Flatten the argument object to a readable form
            const args = this.flattenArgs(field.arguments as unknown as readonly ObjectFieldNode[]);
            const procArgs: { name: string; value: any; isString: boolean }[] = [];

            for (const key in args) {
                procArgs.push({
                    name: key,
                    value: args[key],
                    isString: typeof args[key] === "string",
                });
            }

            // If arguments exists then store them in the structure's args property
            if (args && Object.keys(args).length > 0) {
                structure[key].args = procArgs;
            } else {
                structure[key].args = [];
            }
        });

        // Return what was built
        return structure;
    };

    /**
     * Flatten the Argument nodes of the GraphQL Field query into a readable form
     *
     * @param args GraphQLs Argument Object
     * @returns { any }
     */
    private flattenArgs = (args: readonly ObjectFieldNode[]): any => {
        // Create default return object
        const flattened: any = {};

        // For each object in the GraphQL Argument array
        args.forEach((x) => {
            // If the value has a field array then recursively retrieving the arguments for it's values
            if ((x.value as ObjectValueNode)?.fields?.length > 0) {
                flattened[x.name.value] = this.flattenArgs((x.value as ObjectValueNode).fields);
            }
            // If the value has a value array
            else if ((x.value as ListValueNode)?.values?.length > 0) {
                // Set a default blank array in the return object
                flattened[x.name.value] = [];
                // Iterate through each value
                (x.value as ListValueNode).values.forEach((y) => {
                    // If the value has a field property that contains an array then recursively retrieving the arguments for it's values
                    if ((y as ObjectValueNode).fields?.length > 0) {
                        flattened[x.name.value].push(
                            this.flattenArgs((y as ObjectValueNode).fields as readonly ObjectFieldNode[])
                        );
                    }
                    // Else store its value inside the return object
                    else {
                        flattened[x.name.value].push((y as unknown as ObjectFieldNode).value);
                    }
                });
            }
            // Else store its values inside the return object
            else {
                flattened[x.name.value] = (x.value as unknown as ObjectFieldNode).value;
            }
        });

        // Return the flattened argument list
        return flattened;
    };
}
