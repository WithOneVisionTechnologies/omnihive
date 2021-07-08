import { FieldNode, ListValueNode, ObjectFieldNode, ObjectValueNode } from "graphql";
import { TableSchema } from "@withonevision/omnihive-core/models/TableSchema";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";
import { IDateWorker } from "@withonevision/omnihive-core/interfaces/IDateWorker";

export class GraphHelper {
    private columnCount: number = 0;
    private joinFieldSuffix: string = "_table";
    private aggregateFieldSuffix: string = "_aggregate";

    public getGraphTypeFromDbType = (dbType: string): string => {
        switch (dbType) {
            case "money":
                return `Float`;
            case "bigint":
                return "Int";
            case "int":
                return `Int`;
            case "smallint":
                return `Int`;
            case "tinyint":
                return `Int`;
            case "float":
                return `Float`;
            case "decimal":
                return `Float`;
            case "numeric":
                return `Float`;
            case "nvarchar":
                return "String";
            case "varchar":
                return `String`;
            case "nchar":
                return `String`;
            case "text":
                return `String`;
            case "varbinary":
                return `String`;
            case "binary":
                return `String`;
            case "datetime":
                return `String`;
            case "date":
                return "String";
            case "time":
                return `String`;
            case "uniqueidentifier":
                return `String`;
            case "bit":
                return "Boolean";
            default:
                return `String`;
        }
    };

    /**
     *
     * Query Schema Helpers
     *
     */

    //#region Query Schema Helpers

    /** Notes for future:
     *
     * Linking File declared in metadata:
     *
     * Object query structure adds link: boolean property to show it is a link to another database.
     *
     */

    /**
     * Generate a query structure from the graph query
     *
     * Structure Def:
     *      {
     *          [parentName: string]: {
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
    public buildQueryStructure = (
        graphField: readonly FieldNode[],
        parentKey: { key: string; alias: string },
        tableCount: number,
        aliasKeys: any,
        parentCall: string,
        schema: { [tableName: string]: TableSchema[] }
    ): any => {
        // Initiate default object
        let structure: any = {};

        // Iterate through each field in the selection node
        graphField.forEach((field) => {
            // Get all selections in the set
            const fieldSelections = field?.selectionSet?.selections;

            const structureKeyObj: { key: string; alias: string } = {
                key: field.name.value,
                alias: field.alias?.value ?? "",
            };

            let structureKey: string = field.name.value;

            if (field.alias?.value) {
                structureKey = field.alias.value;
            }

            // If this field has a selection set then it is a join property
            if (fieldSelections && fieldSelections.length > 0) {
                // If the structure property does not exist for this field create it
                if (!structure[structureKey]) {
                    structure[structureKey] = {};
                }

                // Increment the table count
                tableCount++;
                // Recurse through the query builder for the current field values

                structure[structureKey] = this.buildQueryStructure(
                    fieldSelections as FieldNode[],
                    structureKeyObj,
                    tableCount,
                    aliasKeys,
                    parentCall,
                    schema
                );

                // Set the table alias
                structure[structureKey].tableAlias = `t${tableCount}`;

                // Set original Query Prop for table gathering
                structure[structureKey].queryKey = field.name.value;

                // Set aggregate flag
                structure[structureKey].aggregate = field.name.value.endsWith(this.aggregateFieldSuffix);
            }
            // Else this is a database column
            else {
                this.buildColumnStructure(
                    structure,
                    aliasKeys,
                    field,
                    parentKey.key,
                    parentCall.replace(this.aggregateFieldSuffix, "").replace(this.joinFieldSuffix, ""),
                    schema
                );
            }

            // Build the join properties
            this.buildJoinStructure(structure, field, parentKey.key, parentCall, schema);

            // Build the argument properties
            this.buildArgumentStructure(structure, field, parentKey.key, schema);
        });

        // Return what was built
        return structure;
    };

    /**
     * Build the column data of the query structure
     *
     * @param structure
     * @param aliasKeys
     * @param field
     * @param parentKey
     * @param parentCall
     * @param schema
     * @returns { void }
     */
    private buildColumnStructure = (
        structure: any,
        aliasKeys: any,
        field: FieldNode,
        parentKey: string,
        parentCall: string,
        schema: { [tableName: string]: TableSchema[] }
    ): void => {
        // If the current structure does not have a column property initialize it
        if (!structure.columns) {
            structure.columns = [];
        }

        // Create the Column object
        let fieldKeys: any = {
            name: field.name.value,
            alias: `f${this.columnCount}`,
            dbName: schema[parentCall].find((x) => x.columnNameEntity === field.name.value)?.columnNameDatabase,
        };

        // Add aggregate data if needed
        if (parentKey.endsWith(this.aggregateFieldSuffix)) {
            fieldKeys.parent = parentKey.replace(this.aggregateFieldSuffix, "");
        }

        // Store the created column object into the necessary objects for reference
        aliasKeys.push(fieldKeys);
        structure.columns.push(fieldKeys);

        // Increment column count
        this.columnCount++;
    };

    /**
     * Build the join data into the query structure
     *
     * @param structure
     * @param field
     * @param parentKey
     * @param parentCall
     * @param schema
     * @returns { void }
     */
    private buildJoinStructure = (
        structure: any,
        field: FieldNode,
        parentKey: string,
        parentCall: string,
        schema: { [tableName: string]: TableSchema[] }
    ): void => {
        // If the field name has the join identifier or the field name is the primary query function set needed properties
        if (
            field.name.value.endsWith(this.joinFieldSuffix) ||
            field.name.value.endsWith(this.aggregateFieldSuffix) ||
            field.name.value === parentCall
        ) {
            // Set the table key as the field name with the join identifier removed
            let tableKey = field.name.value.replace(this.joinFieldSuffix, "").replace(this.aggregateFieldSuffix, "");
            let structureKey: string = field.name.value;

            if (field.alias?.value) {
                structureKey = field.alias?.value;
            }

            // If the schema sub-object for the table key exists this is a join to the parent table
            if (schema[tableKey]) {
                // Set the structure's tableKey value as the current tableKey value
                structure[structureKey].tableKey = tableKey;

                let tableName: string = parentKey
                    .replace(this.joinFieldSuffix, "")
                    .replace(this.aggregateFieldSuffix, "");

                // Set the structure's parentTableKey property as the current parentKey value with the join identifier removed
                structure[structureKey].parentTableKey = tableName;
            }
            // Else this is a join to another table from the parent table
            else {
                const columnSchema = schema[parentKey].find(
                    (x) =>
                        field.name.value.replace(this.joinFieldSuffix, "").replace(this.aggregateFieldSuffix, "") ===
                        x.columnNameEntity
                );

                if (columnSchema) {
                    // Find the table being linked to and set the structure's tableKey property
                    structure[structureKey].tableKey =
                        columnSchema.schemaName + columnSchema.columnForeignKeyTableNamePascalCase;
                }

                // Set the parent key as the linkingTableKey value
                structure[structureKey].linkingTableKey = parentKey;
            }
        }
    };

    /**
     * Build the argument data for the query structure
     *
     * @param structure
     * @param field
     * @param parentKey
     * @param parentCall
     * @param schema
     * @returns { void }
     */
    private buildArgumentStructure = (
        structure: any,
        field: FieldNode,
        parentKey: string,
        schema: { [tableName: string]: TableSchema[] }
    ): void => {
        // Flatten the argument object to a readable form
        const args = this.flattenArgs(field.arguments as unknown as readonly ObjectFieldNode[]);

        if (
            args.groupBy?.columns &&
            args.groupBy?.columns?.length > 0 &&
            structure[field.alias?.value ?? field.name.value].columns.some(
                (x: { name: string; alias: string; dbName: string }) =>
                    !args.groupBy.columns.some((group: string) => x.name === group)
            )
        ) {
            const missingKeys: { name: string; alias: string; dbName: string }[] = structure[
                field.alias?.value ?? field.name.value
            ].columns.filter(
                (x: { name: string; alias: string; dbName: string }) =>
                    !args.groupBy.columns.some((group: string) => x.name === group)
            );
            throw new Error(
                `Missing return values from groupBy: ${missingKeys
                    .map((x: { name: string; alias: string; dbName: string }) => x.name)
                    .join(
                        ", "
                    )} ==> Note: When using the groupBy function all return values must be included in the groupBy columns argument.`
            );
        }

        // If arguments exists then store them in the structure's args property
        if (args && Object.keys(args).length > 0) {
            // If this is an aggregate field then store the aggregate arguments in the column definition
            if (parentKey.endsWith(this.aggregateFieldSuffix)) {
                const column: any = structure.columns.find((x: any) => x.name === field.name.value);
                const baseAggName: string = parentKey.replace(this.aggregateFieldSuffix, "");

                if (column) {
                    column.args = args;

                    column.dbName = schema[baseAggName].find(
                        (x: TableSchema) => x.columnNameEntity === args.column
                    )?.columnNameDatabase;
                }
            }
            // Else store the arguments at the table level
            else {
                structure[field.alias?.value ?? field.name.value].args = args;
            }
        }
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

    /**
     * Find the field name from the user defined alias
     *
     * @param fields
     * @returns { string }
     */
    public findFieldNameFromAlias = (fields: readonly FieldNode[], value: string): string => {
        for (const field of fields) {
            if (field.alias?.value === value || field.name.value === value) {
                return field.name.value;
            } else if (field.selectionSet?.selections && field.selectionSet.selections.length > 0) {
                const result = this.findFieldNameFromAlias(field.selectionSet.selections as FieldNode[], value);

                if (result) {
                    return result;
                }

                continue;
            }
        }

        return "";
    };
    //#endregion

    /**
     *
     * Hydrator
     *
     */

    //#region Hydrator

    /**
     * Build the graph object from the database return set
     *
     * @param structure Structure of the graph query object
     * @param results Sql result set
     * @returns { any }
     */
    public buildGraphReturn = (
        structure: any,
        results: any,
        dateWorker: IDateWorker | undefined,
        useAlias: boolean = true
    ): any => {
        let condensedResults: any = [];

        // Iterate through each database result and build the graph return object
        results.forEach((dbItem: any) => {
            this.processRow(condensedResults, dbItem, structure, dateWorker, useAlias);
        });

        // Paginate Results
        if (structure.args?.page || structure.args?.limit) {
            const page: number = structure.args.page ?? 1;
            const limit: number = structure.args.limit ?? 10000;

            condensedResults = condensedResults.slice((page - 1) * limit, page * limit);
        }

        // Paginate each sub-object
        this.paginateResults(structure, condensedResults, []);

        // Return transformed object
        return condensedResults;
    };

    /**
     * Process a single database row result
     *
     * @param results Final result object
     * @param dbItem Single database result row
     * @param structure Structure of the graph query object
     * @returns { void }
     */
    private processRow = (
        results: any,
        dbItem: any,
        structure: any,
        dateWorker: IDateWorker | undefined,
        useAlias: boolean
    ) => {
        let parent: any;

        // Get the return columns of the current structure level
        const columns: { name: string; alias: string; dbName: string }[] = structure.columns ?? [];

        // Get the joins of the current structure level
        const linkingKeys: string[] = Object.keys(structure).filter((x: string) => structure[x].args?.join);

        if (results.length <= 0) {
            results.push({});
        }

        // Find any matching data at this structure level
        for (const item of results) {
            if (this.compareParentData(columns, item, dbItem, useAlias)) {
                parent = item;
            }
        }

        // If a match exists then build onto the matching object
        if (parent) {
            this.buildDataFromRow(parent, dbItem, columns, linkingKeys, structure, dateWorker, useAlias);
        }

        // Else create a new array entry
        else {
            if (Object.keys(results[results.length - 1]).length > 0) {
                results.push({});
            }

            this.buildDataFromRow(
                results[results.length - 1],
                dbItem,
                columns,
                linkingKeys,
                structure,
                dateWorker,
                useAlias
            );
        }
    };

    /**
     * Build the Graph result object from the database result row
     *
     * @param item Matching results sub-object
     * @param dbItem Database result row
     * @param columns Desired return columns object array
     * @param linkingKeys Linking Property name of structure object
     * @param structure Structure of the graph query object
     * @returns { void }
     */
    private buildDataFromRow = (
        item: any,
        dbItem: any,
        columns: { name: string; alias: string; dbName: string }[],
        linkingKeys: string[],
        structure: any,
        dateWorker: IDateWorker | undefined,
        useAlias: boolean
    ): void => {
        // Build the graph return item for this structure level
        for (const col of columns) {
            if (!item[col.name]) {
                let dbItemValue: any = dbItem[col.alias];

                if (!useAlias) {
                    dbItemValue = dbItem[col.dbName];
                }

                if (IsHelper.isDate(dbItemValue) && dateWorker) {
                    dbItemValue = dateWorker.getFormattedDateString(dbItemValue);
                }

                item[col.name] = dbItemValue;
            }
        }

        // If a join exists then create a new property that is an empty array
        for (const key of linkingKeys) {
            if (!item[structure[key].queryKey]) {
                item[structure[key].queryKey] = [];
            }

            // Process the join on the next object level
            this.processRow(item[structure[key].queryKey], dbItem, structure[key], dateWorker, useAlias);
        }
    };

    /**
     * Find matching data for the database result row
     *
     * @param columns Desired return columns object array
     * @param item Current graph return object for this structure level and array index
     * @param dbItem
     * @returns { boolean }
     */
    private compareParentData = (
        columns: { name: string; alias: string; dbName: string }[],
        item: any,
        dbItem: any,
        useAlias: boolean
    ) => {
        // Iterate through each returning column
        for (const col of columns) {
            // if the item does not have that column property return false
            if (!item[col.name]) {
                return false;
            }

            // If the current return object does not match the database return object
            // for the given column then return false
            let dbComparer: any = useAlias ? dbItem[col.alias] : dbItem[col.name];

            if (item[col.name] !== dbComparer) {
                return false;
            }
        }

        // If all conditions pass return true
        return true;
    };

    /**
     * Paginate the results
     *
     * @param structure
     * @param results
     * @param keys
     * @returns { void }
     */
    private paginateResults = (structure: any, results: any, keys: string[]): void => {
        // Iterate through each structure key
        for (const key in structure) {
            // If the key is a join key push the key value to iterate through and recursively call the next structure layer
            if (structure[key].args?.join) {
                keys.push(structure[key].queryKey);
                this.paginateResults(structure[key], results, keys);
            }

            // If there are pagination arguments then paginate the sub-object
            if (structure[key].args?.page || structure[key].args?.limit) {
                const page: number = structure[key].args.page ?? 1;
                const limit: number = structure[key].args.limit ?? 10000;

                results.forEach((item: any) => {
                    this.paginateSubResultItem(keys, item, page, limit);
                });
            }
        }
    };

    /**
     * Paginate the sub-objects
     *
     * @param keys
     * @param item
     * @param page
     * @param limit
     * @returns { void }
     */
    private paginateSubResultItem = (keys: string[], item: any, page: number = 1, limit: number = 10000): void => {
        // If this is the correct level then paginate as defined
        if (keys.length === 1) {
            item[keys[0]] = item[keys[0]].slice((page - 1) * limit, page * limit);
        }
        // Else iterate down the key list until the desired object level is reached
        else {
            item[keys[0]].forEach((x: any) => this.paginateSubResultItem(keys.slice(1), x, page, limit));
        }
    };

    //#endregion
}
