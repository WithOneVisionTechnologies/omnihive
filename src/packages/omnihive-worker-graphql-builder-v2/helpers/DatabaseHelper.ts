import { Knex } from "knex";
import { IsHelper } from "src/packages/omnihive-core/helpers/IsHelper";
import { TableSchema } from "src/packages/omnihive-core/models/TableSchema";

export class DatabaseHelper {
    private joinFieldSuffix: string = "_table";

    /**
     * Convert an object with entity property names to an object with db property names
     *
     * @param entityObject
     * @param columns
     * @returns { any }
     */
    public convertEntityObjectToDbObject = (entityObject: any, columns: TableSchema[]): any => {
        // If the object is an array iterate through the array converting property names
        if (IsHelper.isArray(entityObject)) {
            return entityObject.map((x) => this.convertEntityObjectToDbObject(x, columns));
        }

        // Initiate return object
        const dbObject: any = {};

        // Iterate through each key
        for (const entityName in entityObject) {
            // Find the TableSchema for the matching property
            const schemaColumn: TableSchema | undefined = columns.find((x) => x.columnNameEntity === entityName);

            if (schemaColumn) {
                // Transform the entities value to the proper database equivalent
                let entityValue = entityObject[entityName];

                if (IsHelper.isBoolean(entityValue) && schemaColumn.columnTypeEntity === "boolean") {
                    entityValue = entityValue ? 1 : 0;
                }

                if (IsHelper.isString(entityValue) && schemaColumn.columnTypeEntity === "number") {
                    entityValue = Number.parseFloat(entityValue);
                }

                // Set the database object property
                dbObject[schemaColumn.columnNameDatabase] = entityValue;
            }
        }

        return dbObject;
    };

    /**
     *
     * Where, Order By, Group By Builders
     *
     */

    //#region Conditional Builder

    /**
     * Build the database query conditional structure
     *
     * @param args Flattened argument list
     * @param tableAlias Table alias of the current table
     * @param builder Current database query builder
     * @param tableName Entity table name
     * @param schema Database Schema
     * @param knex Database query builder parent object
     * @param join Flag to dictate this should be added to an on statement and not a where statement
     * @returns { void }
     */
    public buildConditions = (
        args: any,
        tableAlias: string,
        builder: Knex.QueryBuilder<any, unknown[]> | Knex.JoinClause,
        tableName: string,
        schema: { [tableName: string]: TableSchema[] },
        knex: Knex | undefined,
        join: boolean = false,
        joinParentBuilder?: Knex.QueryBuilder<any, unknown[]>
    ) => {
        // If knex is not properly initialized then throw an error
        if (!knex) {
            throw new Error("Knex is not initialized");
        }

        // Iterate through the args' keys
        for (const knexFunction in args) {
            // Perform the related function depending on the key's value
            switch (knexFunction) {
                case "where": {
                    this.buildEqualities(args[knexFunction], tableAlias, builder, tableName, schema, knex, false, join);
                    break;
                }
                case "orderBy": {
                    this.buildOrderBy(
                        args[knexFunction],
                        tableAlias,
                        tableName,
                        join && joinParentBuilder ? joinParentBuilder : (builder as Knex.QueryBuilder<any, unknown[]>),
                        schema
                    );
                    break;
                }
                case "groupBy": {
                    this.buildGroupBy(
                        args[knexFunction],
                        tableAlias,
                        tableName,
                        join && joinParentBuilder ? joinParentBuilder : (builder as Knex.QueryBuilder<any, unknown[]>),
                        schema,
                        knex
                    );
                    break;
                }
            }
        }
    };

    /**
     * Build the equality arguments based on the current need
     *
     * @param arg Flattened argument object (sub-object of the calling functions args object)
     * @param tableAlias Table alias of the current table
     * @param builder Current database query builder
     * @param tableName Entity table name
     * @param having Flag to indicate this should be added to a having statement
     * @param join Flag to indicate this should be added to an on statement
     * @returns { void }
     */
    private buildEqualities = (
        arg: any,
        tableAlias: string,
        builder: Knex.QueryBuilder<any, unknown[]> | Knex.JoinClause,
        tableName: string,
        schema: { [tableName: string]: TableSchema[] },
        knex: Knex,
        having: boolean = false,
        join: boolean = false
    ): void => {
        // If the builder is not properly initialized then throw an error
        if (!builder) {
            throw new Error("Knex Query Builder is not initialized");
        }

        // Iterate through each key of the arg object
        for (const key in arg) {
            // If the key is "and" then call this function again with it's sub-object with a sub-builder
            if (key === "and") {
                // if the join flag is passed in use the andOn sub-builder
                if (join) {
                    // Call this function again using the sub-builder and the arguments sub-object
                    (builder as Knex.JoinClause).andOn((subBuilder) => {
                        for (const innerArg of arg.and) {
                            this.buildEqualities(
                                innerArg,
                                tableAlias,
                                subBuilder,
                                tableName,
                                schema,
                                knex,
                                false,
                                join
                            );
                        }
                    });
                } else {
                    // Call this function again using the and sub-builder and the arguments sub-object
                    (builder as Knex.QueryBuilder)[having ? "andHaving" : "andWhere"]((subBuilder) => {
                        for (const innerArg of arg.and) {
                            this.buildEqualities(innerArg, tableAlias, subBuilder, tableName, schema, knex, having);
                        }
                    });
                }
                continue;
            }

            // If the key is "or" then call this function again with it's sub-object with a sub-builder
            if (key === "or") {
                // If the join flag is passed in use the orOn sub-builder
                if (join) {
                    // Call this function again using the sub-builder and the arguments sub-object
                    (builder as Knex.JoinClause).orOn((subBuilder) => {
                        for (const innerArg of arg.or) {
                            this.buildEqualities(
                                innerArg,
                                tableAlias,
                                subBuilder,
                                tableName,
                                schema,
                                knex,
                                false,
                                join
                            );
                        }
                    });
                } else {
                    // Call this function again using the or sub-builder and the arguments sub-object
                    (builder as Knex.QueryBuilder)[having ? "orHaving" : "orWhere"]((subBuilder) => {
                        for (const innerArg of arg.or) {
                            this.buildEqualities(innerArg, tableAlias, subBuilder, tableName, schema, knex, having);
                        }
                    });
                }
                continue;
            }

            // Find the database column name to be used in the database query
            const columnName = schema[tableName].find((c) => c.columnNameEntity === key)?.columnNameDatabase;

            // If the columnName is found then build the equality line of the database query for this column
            if (columnName) {
                const argName: string = tableAlias ? `${tableAlias}.${columnName}` : columnName;
                this.buildRowEquality(argName, arg[key], builder, knex, having, join);
            }
        }
    };

    /**
     * Build the Equality check for the database query for this given column
     *
     * @param argName Database value for the column being compared
     * @param arg Flattened Argument Object
     * @param builder Current database query builder
     * @param having Flag to indicate this should be added to a having statement
     * @param join Flag to indicate this should be added to an on statement
     * @returns { void }
     */
    private buildRowEquality = (
        argName: string,
        arg: any,
        builder: Knex.QueryBuilder<any, unknown[]> | Knex.JoinClause,
        knex: Knex,
        having: boolean = false,
        join: boolean = false
    ): void => {
        // Iterate through each key in the arg object
        for (const equality in arg) {
            // Retrieve the value of the comparison
            let argValue = arg[equality];

            // If the argument value is an object that contains a subquery property then set the raw value as the argValue
            if (argValue.raw) {
                argValue = knex.raw(`${argValue.raw}`);
            }

            // If the join flag is set then use the raw values as the argValues
            if (join) {
                if (typeof argValue === "string") {
                    argValue = knex.raw(`'${argValue}'`);
                } else {
                    argValue = knex.raw(argValue);
                }
            }

            // If the argValue is a boolean then transform the value to their database equivalents
            if (typeof argValue === "boolean") {
                argValue = argValue ? 1 : 0;
            }

            // Build the equality segment of the database query
            switch (equality) {
                case "eq": {
                    // If the join flag is set build the on equality segment
                    if (join) {
                        (builder as Knex.JoinClause).on(argName, "=", argValue);
                    }
                    // If the having flag is set build the having equality segment
                    else if (having) {
                        (builder as Knex.QueryBuilder).having(argName, "=", argValue);
                    }
                    // Build the where equality segment by default
                    else {
                        (builder as Knex.QueryBuilder).where(argName, argValue);
                    }
                    break;
                }
                case "notEq": {
                    // If the join flag is set build the on equality segment
                    if (join) {
                        (builder as Knex.JoinClause).on(argName, "!=", argValue);
                    }
                    // If the having flag is set build the having equality segment
                    else if (having) {
                        (builder as Knex.QueryBuilder).having(argName, "!=", argValue);
                    }
                    // Build the where equality segment by default
                    else {
                        (builder as Knex.QueryBuilder).whereNot(argName, argValue);
                    }
                    break;
                }
                case "like": {
                    // If the join flag is set build the on equality segment
                    if (join) {
                        (builder as Knex.JoinClause).on(argName, "like", argValue);
                    }
                    // Build the having or where equality segment based on the having flag
                    else {
                        (builder as Knex.QueryBuilder)[having ? "having" : "where"](argName, "like", argValue);
                    }
                    break;
                }
                case "notLike": {
                    // If the join flag is set build the on equality segment
                    if (join) {
                        (builder as Knex.JoinClause).on(argName, "not like", argValue);
                    }
                    // If the having flag is set build the having equality segment
                    else if (having) {
                        (builder as Knex.QueryBuilder).having(argName, "not like", argValue);
                    }
                    // Build the where equality segment by default
                    else {
                        (builder as Knex.QueryBuilder).whereNot(argName, "like", argValue);
                    }
                    break;
                }
                case "gt": {
                    // If the join flag is set build the on equality segment
                    if (join) {
                        (builder as Knex.JoinClause).on(argName, ">", argValue);
                    }
                    // Build the having or where equality segment based on the having flag
                    else {
                        (builder as Knex.QueryBuilder)[having ? "having" : "where"](argName, ">", argValue);
                    }
                    break;
                }
                case "gte": {
                    // If the join flag is set build the on equality segment
                    if (join) {
                        (builder as Knex.JoinClause).on(argName, ">=", argValue);
                    }
                    // Build the having or where equality segment based on the having flag
                    else {
                        (builder as Knex.QueryBuilder)[having ? "having" : "where"](argName, ">=", argValue);
                    }
                    break;
                }
                case "notGt": {
                    // If the join flag is set build the on equality segment
                    if (join) {
                        (builder as Knex.JoinClause).on(argName, "<=", argValue);
                    }
                    // If the having flag is set build the having equality segment
                    else if (having) {
                        (builder as Knex.QueryBuilder).having(argName, "<=", argValue);
                    }
                    // Build the where equality segment by default
                    else {
                        (builder as Knex.QueryBuilder).whereNot(argName, ">", argValue);
                    }
                    break;
                }
                case "notGte": {
                    // If the join flag is set build the on equality segment
                    if (join) {
                        (builder as Knex.JoinClause).on(argName, "<", argValue);
                    }
                    // If the having flag is set build the having equality segment
                    else if (having) {
                        (builder as Knex.QueryBuilder).having(argName, "<", argValue);
                    }
                    // Build the where equality segment by default
                    else {
                        (builder as Knex.QueryBuilder).whereNot(argName, ">=", argValue);
                    }
                    break;
                }
                case "lt": {
                    // If the join flag is set build the on equality segment
                    if (join) {
                        (builder as Knex.JoinClause).on(argName, "<", argValue);
                    }
                    // Build the having or where equality segment based on the having flag
                    else {
                        (builder as Knex.QueryBuilder)[having ? "having" : "where"](argName, "<", argValue);
                    }
                    break;
                }
                case "lte": {
                    // If the join flag is set build the on equality segment
                    if (join) {
                        (builder as Knex.JoinClause).on(argName, "<=", argValue);
                    }
                    // Build the having or where equality segment based on the having flag
                    else {
                        (builder as Knex.QueryBuilder)[having ? "having" : "where"](argName, "<=", argValue);
                    }
                    break;
                }
                case "notLt": {
                    // If the join flag is set build the on equality segment
                    if (join) {
                        (builder as Knex.JoinClause).on(argName, ">=", argValue);
                    }
                    // If the having flag is set build the having equality segment
                    else if (having) {
                        (builder as Knex.QueryBuilder).having(argName, ">=", argValue);
                    }
                    // Build the where equality segment by default
                    else {
                        (builder as Knex.QueryBuilder).whereNot(argName, "<", argValue);
                    }
                    break;
                }
                case "notLte": {
                    // If the join flag is set build the on equality segment
                    if (join) {
                        (builder as Knex.JoinClause).on(argName, ">", argValue);
                    }
                    // If the having flag is set build the having equality segment
                    else if (having) {
                        (builder as Knex.QueryBuilder).having(argName, ">", argValue);
                    }
                    // Build the where equality segment by default
                    else {
                        (builder as Knex.QueryBuilder).whereNot(argName, "<=", argValue);
                    }
                    break;
                }
                case "in": {
                    // If the join flag is set build the on equality segment
                    if (join) {
                        (builder as Knex.JoinClause).onIn(argName, argValue);
                    }
                    // Build the having or where equality segment based on the having flag
                    else {
                        (builder as Knex.QueryBuilder)[having ? "havingIn" : "whereIn"](argName, argValue);
                    }
                    break;
                }
                case "notIn": {
                    // If the join flag is set build the on equality segment
                    if (join) {
                        (builder as Knex.JoinClause).onNotIn(argName, argValue);
                    }
                    // Build the having or where equality segment based on the having flag
                    else {
                        (builder as Knex.QueryBuilder)[having ? "havingNotIn" : "whereNotIn"](argName, argValue);
                    }
                    break;
                }
                case "isNull": {
                    // If the join flag is set build the on equality segment
                    if (join) {
                        (builder as Knex.JoinClause).onNull(argName);
                    }
                    // If the having flag is set build the having equality segment
                    else if (having) {
                        (builder as Knex.QueryBuilder).having(argName, "is", knex.raw("null"));
                    }
                    // Build the where equality segment by default
                    else {
                        (builder as Knex.QueryBuilder).whereNull(argName);
                    }
                    break;
                }
                case "isNotNull": {
                    // If the join flag is set build the on equality segment
                    if (join) {
                        (builder as Knex.JoinClause).onNotNull(argName);
                    }
                    // If the having flag is set build the having equality segment
                    else if (having) {
                        (builder as Knex.QueryBuilder).having(argName, "is not", knex.raw("null"));
                    }
                    // Build the where equality segment by default
                    else {
                        (builder as Knex.QueryBuilder).whereNotNull(argName);
                    }
                    break;
                }
                case "exists": {
                    // If the join flag is set build the on equality segment
                    if (join) {
                        (builder as Knex.JoinClause).onExists(argValue);
                    }
                    // If the having flag is set build the having equality segment
                    else if (having) {
                        throw new Error("The Having function does not support the exists equality");
                    }
                    // Build the where equality segment by default
                    else {
                        (builder as Knex.QueryBuilder).whereExists(argValue);
                    }
                    break;
                }
                case "notExists": {
                    // If the join flag is set build the on equality segment
                    if (join) {
                        (builder as Knex.JoinClause).onNotExists(argValue);
                    }
                    // If the having flag is set build the having equality segment
                    else if (having) {
                        throw new Error("The Having function does not support the notExists equality");
                    }
                    // Build the where equality segment by default
                    else {
                        (builder as Knex.QueryBuilder).whereNotExists(argValue);
                    }
                    break;
                }
                case "between": {
                    // If the join flag is set build the on equality segment
                    if (join) {
                        (builder as Knex.JoinClause).onBetween(argName, [argValue.start, argValue.end]);
                    }
                    // Build the having or where equality segment based on the having flag
                    else {
                        (builder as Knex.QueryBuilder)[having ? "havingBetween" : "whereBetween"](argName, [
                            argValue.start,
                            argValue.end,
                        ]);
                    }
                    break;
                }
                case "notBetween": {
                    // If the join flag is set build the on equality segment
                    if (join) {
                        (builder as Knex.JoinClause).onNotBetween(argName, [argValue.start, argValue.end]);
                    }
                    // Build the having or where equality segment based on the having flag
                    else {
                        (builder as Knex.QueryBuilder)[having ? "havingNotBetween" : "whereNotBetween"](argName, [
                            argValue.start,
                            argValue.end,
                        ]);
                    }
                    break;
                }
            }
        }
    };

    /**
     * Build the order by segment of the database query
     *
     * @param arg Flattened argument object
     * @param tableAlias Table alias of the current table
     * @param tableName Entity table name
     * @returns { void }
     */
    private buildOrderBy = (
        arg: any,
        tableAlias: string,
        tableName: string,
        builder: Knex.QueryBuilder<any, unknown[]>,
        schema: { [tableName: string]: TableSchema[] }
    ): void => {
        // Initiate an array to store the order by values in the given order
        const orderByArgs: { column: string; order: "asc" | "desc" }[] = [];

        // Iterate through each argument and build the order by array item
        for (const field of arg) {
            // Iterate through the argument item's keys
            Object.keys(field).map((key) => {
                // Retrieve the database name for the column
                const dbName = this.findDbName(key, tableName, schema);

                // If the database name was found push the item into the order by array
                if (dbName) {
                    orderByArgs.push({ column: `${tableAlias}.${dbName}`, order: field[key] });
                }
            });
        }

        // Populate the order by segment in the database query
        builder.orderBy(orderByArgs);
    };

    /**
     * Build the group by segment of the database query
     *
     * @param arg Flattened argument object
     * @param tableAlias Table alias of the current table
     * @param tableName Entity table name
     * @returns { void }
     */
    private buildGroupBy = (
        arg: { columns: string[]; having: any },
        tableAlias: string,
        tableName: string,
        builder: Knex.QueryBuilder<any, unknown[]>,
        schema: { [tableName: string]: TableSchema[] },
        knex: Knex
    ): void => {
        // If the database query builder is not initialized properly then throw an error
        if (!builder) {
            throw new Error("Knex Query Builder is not initialized");
        }

        const dbNames: string[] = [];

        // if the the columns property is an array the iterate through each item
        // populating the dbNames array with the column's database name
        if (Array.isArray(arg.columns)) {
            arg.columns.forEach((x) => {
                const name = this.findDbName(x, tableName, schema);
                if (name) {
                    dbNames.push(name);
                }
            });
        }
        // Else find the values database name and push the value into the dbNames array
        else {
            const name = this.findDbName(arg.columns, tableName, schema);

            if (name) {
                dbNames.push(name);
            }
        }

        // Build the group by section of the database query
        builder.groupBy(dbNames);

        // If the arguments has the having property then build the having equalities
        if (arg.having) {
            this.buildEqualities(arg.having, tableAlias, builder, tableName, schema, knex, true);
        }
    };

    /**
     * Find the database name for a given column's entity name and table name
     *
     * @param fieldName Column's entity name
     * @param tableName The Column's table entity name
     * @returns
     */
    private findDbName = (fieldName: string, tableName: string, schema: { [tableName: string]: TableSchema[] }) => {
        const name = schema[tableName].find((column) => column.columnNameEntity === fieldName)?.columnNameDatabase;

        return name;
    };

    /**
     * Build joins into foreign tables
     *
     * @param structure Structure of the graph query object
     * @param tableKey Parent key of the calling structure level
     * @param queryKey Structure's key for joining to foreign tables from the parent table
     * @returns { void }
     */
    public buildJoins = (
        builder: Knex.QueryBuilder<any, unknown[]>,
        structure: any,
        tableKey: string,
        queryKey: string,
        schema: { [tableName: string]: TableSchema[] },
        knex: Knex,
        masterStructure: any,
        masterKey: string
    ): void => {
        // If the builder is not initialized properly then throw an error
        if (!builder) {
            throw new Error("Knex Query Builder not initialized");
        }

        // If the current structure level has an argument that contains a join property then this is a proper join
        if (structure.args?.join) {
            // Retrieve the table the query is joining to
            let joinTable: string = schema[tableKey]?.[0]?.tableName;

            let primaryColumnName: string = "";
            let linkingColumnName: string = "";

            // Set schema key based on directionality of the join
            const schemaKey = structure.linkingTableKey ? structure.linkingTableKey : tableKey;

            // Retrieve the TableSchema of the column in the parent table
            const primaryColumn: TableSchema | undefined = schema[schemaKey]?.find(
                (x) =>
                    x.columnNameEntity === structure.args.join.from ||
                    (!structure.args.join.from && x.columnNameEntity === queryKey.replace(this.joinFieldSuffix, ""))
            );

            let parentAlias = "";

            // If the primary column was found this is a proper join
            if (primaryColumn) {
                primaryColumnName = `${primaryColumn.columnNameDatabase}`;
                linkingColumnName = `${primaryColumn.columnForeignKeyColumnName}`;

                // Get the table aliases and all joining information for the database joins
                if (structure.linkingTableKey) {
                    parentAlias = this.findParentAlias(masterStructure[masterKey], schemaKey);
                    joinTable = primaryColumn.columnForeignKeyTableName;

                    primaryColumnName = `${parentAlias}.${primaryColumnName}`;
                    linkingColumnName = `${structure.tableAlias}.${linkingColumnName}`;
                } else {
                    parentAlias = this.findParentAlias(
                        masterStructure[masterKey],
                        primaryColumn.schemaName + primaryColumn.columnForeignKeyTableNamePascalCase
                    );
                    primaryColumnName = `${structure.tableAlias}.${primaryColumnName}`;
                    linkingColumnName = `${parentAlias}.${linkingColumnName}`;
                }

                // Get the join's whereMode property
                const whereSpecific: boolean = structure.args?.join?.whereMode === "specific";

                // Build the database query segment for the specified join
                switch (structure.args.join.type) {
                    case "inner": {
                        // If whereMode is specific then add the conditions on the join
                        if (whereSpecific) {
                            builder.innerJoin(`${joinTable} as ${structure.tableAlias}`, (subBuilder) => {
                                subBuilder.on(primaryColumnName, "=", linkingColumnName);
                                this.buildConditions(
                                    structure.args,
                                    structure.tableAlias,
                                    subBuilder,
                                    tableKey,
                                    schema,
                                    knex,
                                    true,
                                    builder
                                );
                            });
                        }
                        // Else add the standard join
                        else {
                            builder.innerJoin(
                                `${joinTable} as ${structure.tableAlias}`,
                                primaryColumnName,
                                linkingColumnName
                            );
                        }
                        break;
                    }
                    case "left": {
                        // If whereMode is specific then add the conditions on the join
                        if (whereSpecific) {
                            builder.leftJoin(`${joinTable} as ${structure.tableAlias}`, (subBuilder) => {
                                subBuilder.on(primaryColumnName, "=", linkingColumnName);
                                this.buildConditions(
                                    structure.args,
                                    structure.tableAlias,
                                    subBuilder,
                                    tableKey,
                                    schema,
                                    knex,
                                    true,
                                    builder
                                );
                            });
                        }
                        // Else add the standard join
                        else {
                            builder.leftJoin(
                                `${joinTable} as ${structure.tableAlias}`,
                                primaryColumnName,
                                linkingColumnName
                            );
                        }
                        break;
                    }
                    case "leftOuter": {
                        // If whereMode is specific then add the conditions on the join
                        if (whereSpecific) {
                            builder.leftOuterJoin(`${joinTable} as ${structure.tableAlias}`, (subBuilder) => {
                                subBuilder.on(primaryColumnName, "=", linkingColumnName);
                                this.buildConditions(
                                    structure.args,
                                    structure.tableAlias,
                                    subBuilder,
                                    tableKey,
                                    schema,
                                    knex,
                                    true,
                                    builder
                                );
                            });
                        }
                        // Else add the standard join
                        else {
                            builder.leftOuterJoin(
                                `${joinTable} as ${structure.tableAlias}`,
                                primaryColumnName,
                                linkingColumnName
                            );
                        }
                        break;
                    }
                    case "right": {
                        // If whereMode is specific then add the conditions on the join
                        if (whereSpecific) {
                            builder.rightJoin(`${joinTable} as ${structure.tableAlias}`, (subBuilder) => {
                                subBuilder.on(primaryColumnName, "=", linkingColumnName);
                                this.buildConditions(
                                    structure.args,
                                    structure.tableAlias,
                                    subBuilder,
                                    tableKey,
                                    schema,
                                    knex,
                                    true,
                                    builder
                                );
                            });
                        }
                        // Else add the standard join
                        else {
                            builder.rightJoin(
                                `${joinTable} as ${structure.tableAlias}`,
                                primaryColumnName,
                                linkingColumnName
                            );
                        }
                        break;
                    }
                    case "rightOuter": {
                        // If whereMode is specific then add the conditions on the join
                        if (whereSpecific) {
                            builder.rightOuterJoin(`${joinTable} as ${structure.tableAlias}`, (subBuilder) => {
                                subBuilder.on(primaryColumnName, "=", linkingColumnName);
                                this.buildConditions(
                                    structure.args,
                                    structure.tableAlias,
                                    subBuilder,
                                    tableKey,
                                    schema,
                                    knex,
                                    true,
                                    builder
                                );
                            });
                        }
                        // Else add the standard join
                        else {
                            builder.rightOuterJoin(
                                `${joinTable} as ${structure.tableAlias}`,
                                primaryColumnName,
                                linkingColumnName
                            );
                        }
                        break;
                    }
                    case "fullOuter": {
                        // If whereMode is specific then add the conditions on the join
                        if (whereSpecific) {
                            builder.fullOuterJoin(`${joinTable} as ${structure.tableAlias}`, (subBuilder) => {
                                subBuilder.on(primaryColumnName, "=", linkingColumnName);
                                this.buildConditions(
                                    structure.args,
                                    structure.tableAlias,
                                    subBuilder,
                                    tableKey,
                                    schema,
                                    knex,
                                    true,
                                    builder
                                );
                            });
                        }
                        // Else add the standard join
                        else {
                            builder.fullOuterJoin(
                                `${joinTable} as ${structure.tableAlias}`,
                                primaryColumnName,
                                linkingColumnName
                            );
                        }
                        break;
                    }
                    case "cross": {
                        // If whereMode is specific then add the conditions on the join
                        if (whereSpecific) {
                            builder.crossJoin(`${joinTable} as ${structure.tableAlias}`, (subBuilder) => {
                                subBuilder.on(primaryColumnName, "=", linkingColumnName);
                                this.buildConditions(
                                    structure.args,
                                    structure.tableAlias,
                                    subBuilder,
                                    tableKey,
                                    schema,
                                    knex,
                                    true,
                                    builder
                                );
                            });
                        }
                        // Else add the standard join
                        else {
                            builder.crossJoin(
                                `${joinTable} as ${structure.tableAlias}`,
                                primaryColumnName,
                                linkingColumnName
                            );
                        }
                        break;
                    }
                    default: {
                        // If whereMode is specific then add the conditions on the join
                        if (whereSpecific) {
                            builder.join(`${joinTable} as ${structure.tableAlias}`, (subBuilder) => {
                                subBuilder.on(primaryColumnName, "=", linkingColumnName);
                                this.buildConditions(
                                    structure.args,
                                    structure.tableAlias,
                                    subBuilder,
                                    tableKey,
                                    schema,
                                    knex,
                                    true,
                                    builder
                                );
                            });
                        }
                        // Else add the standard join
                        else {
                            builder.join(
                                `${joinTable} as ${structure.tableAlias}`,
                                primaryColumnName,
                                linkingColumnName
                            );
                        }
                        break;
                    }
                }
            }
        }
    };

    /**
     * Find the given tableKey's database query alias
     *
     * @param structure Structure of the graph query object
     * @param tableKey Table Key to search on
     * @returns { string }
     */
    private findParentAlias = (structure: any, tableKey: string): string => {
        // If the structure tableKey is the search tableKey then return the structure's tableAlias value
        if (structure.tableKey === tableKey) {
            return structure.tableAlias;
        }
        // Else recursively iterate down the structure's definition until the desired value is found
        // or there are no more values to search upon
        else {
            for (const key in structure) {
                let alias: string = "";
                if (structure[key].args?.join) {
                    alias = this.findParentAlias(structure[key], tableKey);
                }

                // If a value was found return it
                if (alias) {
                    return alias;
                }
            }

            // Else return a blank string
            return "";
        }
    };
    //#endregion
}
