/// <reference path="../../../types/globals.omnihive.d.ts" />

import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { OmniHiveLogLevel } from "@withonevision/omnihive-core/enums/OmniHiveLogLevel";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { ICacheWorker } from "@withonevision/omnihive-core/interfaces/ICacheWorker";
import { IDatabaseWorker } from "@withonevision/omnihive-core/interfaces/IDatabaseWorker";
import { IDateWorker } from "@withonevision/omnihive-core/interfaces/IDateWorker";
import { IEncryptionWorker } from "@withonevision/omnihive-core/interfaces/IEncryptionWorker";
import { ILogWorker } from "@withonevision/omnihive-core/interfaces/ILogWorker";
import { ITokenWorker } from "@withonevision/omnihive-core/interfaces/ITokenWorker";
import { ConnectionSchema } from "@withonevision/omnihive-core/models/ConnectionSchema";
import { ConverterSqlInfo } from "@withonevision/omnihive-core/models/ConverterSqlInfo";
import { GraphContext } from "@withonevision/omnihive-core/models/GraphContext";
import { TableSchema } from "@withonevision/omnihive-core/models/TableSchema";
import {
    FieldNode,
    GraphQLArgument,
    GraphQLField,
    GraphQLFieldMap,
    GraphQLList,
    GraphQLObjectType,
    GraphQLResolveInfo,
    SelectionNode,
} from "graphql";
import { Knex } from "knex";
import _ from "lodash";
import { WhereMode } from "../enum/WhereModes";
import { GraphHelper } from "../helpers/GraphHelper";
import { ConverterDatabaseTable } from "../models/ConverterDatabaseTable";
import { ConverterOrderBy } from "../models/ConverterOrderBy";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";

export class ParseAstQuery {
    private databaseWorker!: IDatabaseWorker;
    private encryptionWorker!: IEncryptionWorker;
    private cacheWorker!: ICacheWorker | undefined;
    private dateWorker!: IDateWorker | undefined;
    private parentPath!: GraphQLField<any, any>;
    private knex!: Knex;
    private query!: Knex.QueryBuilder;
    private currentTableIndex: number = 0;
    private currentFieldIndex: number = 0;
    private tables: ConverterDatabaseTable[] = [];
    private orderByList: ConverterOrderBy[] = [];
    private objPagination: { key: string; tableName: string; limit: number; page: number }[] = [];
    private whereHitCounter: number = 0;
    private whereMode: WhereMode = WhereMode.All;

    public parse = async (
        workerName: string,
        args: any,
        resolveInfo: GraphQLResolveInfo,
        omniHiveContext: GraphContext
    ): Promise<any> => {
        const logWorker: ILogWorker | undefined = global.omnihive.getWorker<ILogWorker | undefined>(HiveWorkerType.Log);

        if (IsHelper.isNullOrUndefined(logWorker)) {
            throw new Error("Log Worker Not Defined.  This graph converter will not work without a Log worker.");
        }

        const databaseWorker: IDatabaseWorker | undefined = global.omnihive.getWorker<IDatabaseWorker | undefined>(
            HiveWorkerType.Database,
            workerName
        );

        if (IsHelper.isNullOrUndefined(databaseWorker)) {
            throw new Error(
                "Database Worker Not Defined.  This graph converter will not work without a Database worker."
            );
        }

        const encryptionWorker: IEncryptionWorker | undefined = global.omnihive.getWorker<
            IEncryptionWorker | undefined
        >(HiveWorkerType.Encryption);

        if (IsHelper.isNullOrUndefined(encryptionWorker)) {
            throw new Error(
                "Encryption Worker Not Defined.  This graph converter with Cache worker enabled will not work without an Encryption worker."
            );
        }

        const tokenWorker: ITokenWorker | undefined = global.omnihive.getWorker<ITokenWorker | undefined>(
            HiveWorkerType.Token
        );

        let disableSecurity: boolean =
            global.omnihive.getEnvironmentVariable<boolean>("OH_SECURITY_DISABLE_TOKEN_CHECK") ?? false;

        if (!disableSecurity && IsHelper.isNullOrUndefined(tokenWorker)) {
            throw new Error("[ohAccessError] No token worker defined.");
        }

        if (
            !disableSecurity &&
            !IsHelper.isNullOrUndefined(tokenWorker) &&
            (IsHelper.isNullOrUndefined(omniHiveContext) ||
                IsHelper.isNullOrUndefined(omniHiveContext.access) ||
                IsHelper.isEmptyStringOrWhitespace(omniHiveContext.access))
        ) {
            throw new Error("[ohAccessError] Access token is invalid or expired.");
        }

        if (
            !disableSecurity &&
            !IsHelper.isNullOrUndefined(tokenWorker) &&
            !IsHelper.isNullOrUndefined(omniHiveContext) &&
            !IsHelper.isNullOrUndefined(omniHiveContext.access) &&
            !IsHelper.isEmptyStringOrWhitespace(omniHiveContext.access)
        ) {
            const verifyToken: boolean = await AwaitHelper.execute(tokenWorker.verify(omniHiveContext.access));
            if (!verifyToken) {
                throw new Error("[ohAccessError] Access token is invalid or expired.");
            }
        }

        this.cacheWorker = global.omnihive.getWorker<ICacheWorker | undefined>(HiveWorkerType.Cache);
        this.dateWorker = global.omnihive.getWorker<IDateWorker | undefined>(HiveWorkerType.Date);
        this.databaseWorker = databaseWorker;
        this.encryptionWorker = encryptionWorker;

        const converterInfo: ConverterSqlInfo = await AwaitHelper.execute(this.getSqlFromGraph(resolveInfo, args));

        let cacheKey: string = "";
        let cacheSeconds = -1;

        if (!IsHelper.isNullOrUndefined(this.cacheWorker)) {
            if (
                !IsHelper.isNullOrUndefined(omniHiveContext) &&
                !IsHelper.isNullOrUndefined(omniHiveContext.cacheSeconds)
            ) {
                try {
                    cacheSeconds = +omniHiveContext.cacheSeconds;
                } catch {
                    cacheSeconds = -1;
                }
            }

            if (
                !IsHelper.isNullOrUndefined(omniHiveContext) &&
                !IsHelper.isNullOrUndefined(omniHiveContext.cache) &&
                !IsHelper.isEmptyStringOrWhitespace(omniHiveContext.cache) &&
                omniHiveContext.cache !== "none"
            ) {
                cacheKey = this.encryptionWorker.base64Encode(workerName + "||||" + converterInfo.sql);
            }

            if (
                !IsHelper.isNullOrUndefined(omniHiveContext) &&
                !IsHelper.isNullOrUndefined(omniHiveContext.cache) &&
                !IsHelper.isEmptyStringOrWhitespace(omniHiveContext.cache) &&
                omniHiveContext.cache === "cache"
            ) {
                const keyExists: boolean = await AwaitHelper.execute(this.cacheWorker.exists(cacheKey));

                if (keyExists) {
                    logWorker.write(
                        OmniHiveLogLevel.Info,
                        `(Retrieved from Cache) => ${workerName} => ${converterInfo.sql}`
                    );
                    const cacheResults: string | undefined = await AwaitHelper.execute(this.cacheWorker.get(cacheKey));

                    try {
                        if (
                            !IsHelper.isNullOrUndefined(cacheResults) &&
                            !IsHelper.isEmptyStringOrWhitespace(cacheResults)
                        ) {
                            return JSON.parse(cacheResults);
                        }
                    } catch {
                        omniHiveContext.cache = "cacheRefresh";
                    }
                }
            }
        }

        const dataResults: any[][] = await AwaitHelper.execute(databaseWorker.executeQuery(converterInfo.sql));
        const treeResults: any = this.getGraphFromData(dataResults[0], converterInfo.hydrationDefinition);

        if (!IsHelper.isNullOrUndefined(this.cacheWorker)) {
            if (
                !IsHelper.isNullOrUndefined(omniHiveContext) &&
                !IsHelper.isNullOrUndefined(omniHiveContext.cache) &&
                !IsHelper.isEmptyStringOrWhitespace(omniHiveContext.cache) &&
                omniHiveContext.cache !== "none"
            ) {
                logWorker.write(OmniHiveLogLevel.Info, `(Written to Cache) => ${workerName} => ${converterInfo.sql}`);
                this.cacheWorker.set(cacheKey, JSON.stringify(treeResults), cacheSeconds);
            }
        }

        return treeResults;
    };

    private getGraphFromData = async (dataResults: any, hydrationDefinition: any): Promise<any> => {
        // Build the definition array from the hydrate definition and
        // map back to the original graph.

        const definition: any[] = [];
        definition.push(hydrationDefinition);

        const hydrator = new GraphHelper();
        const hydratedData = hydrator.nestHydrate(dataResults, definition);

        for (const data of hydratedData) {
            this.paginateSubObjects(data);

            for (const key in data) {
                if (
                    // eslint-disable-next-line no-prototype-builtins
                    data.hasOwnProperty(key) &&
                    IsHelper.isDate(data[key]) &&
                    !IsHelper.isNullOrUndefined(this.dateWorker)
                ) {
                    data[key] = this.dateWorker.getFormattedDateString(data[key]);
                }
            }
        }

        return hydratedData;
    };

    private getSqlFromGraph = async (resolveInfo: GraphQLResolveInfo, args: any): Promise<ConverterSqlInfo> => {
        // Get the parent type and the return type to resolve table info
        this.parentPath = _.get(resolveInfo.parentType.getFields(), resolveInfo.fieldNodes[0].name.value);
        const graphReturnType: GraphQLObjectType = (resolveInfo.returnType as GraphQLList<GraphQLObjectType>).ofType;
        const graphParentType: GraphQLObjectType = (this.parentPath.type as GraphQLList<GraphQLObjectType>).ofType;

        this.knex = this.databaseWorker.connection as Knex;
        this.query = this.knex.queryBuilder();

        // Build the root table
        const currentTable: ConverterDatabaseTable = {
            index: this.currentTableIndex,
            graphPath: "",
            tableAlias: `t${this.currentTableIndex}`,
            tableName: graphParentType.extensions?.dbTableName,
        };

        this.tables.push(currentTable);

        // Set the initial "from" clause
        if (this.databaseWorker.metadata.ignoreSchema) {
            this.query.from(`${graphParentType.extensions?.dbTableName} as t${this.currentTableIndex}`);
        } else {
            this.query.from(
                `${graphParentType.extensions?.dbSchemaName}.${graphParentType.extensions?.dbTableName} as t${this.currentTableIndex}`
            );
        }

        // Get the primary keys from the root "from" table if there are any
        let primaryKeys: any[] = [];

        if (
            !IsHelper.isNullOrUndefined(graphParentType) &&
            !IsHelper.isNullOrUndefined(graphParentType.extensions) &&
            !IsHelper.isNullOrUndefined(graphParentType.extensions.dbPrimaryKeys) &&
            IsHelper.isArray(graphParentType.extensions.dbPrimaryKeys)
        ) {
            primaryKeys = _.filter(graphParentType.getFields(), (field) => {
                return (graphParentType.extensions?.dbPrimaryKeys as Array<string>).includes(
                    field.extensions?.dbColumnName
                );
            });
        }

        // Build the root where arguments and get the where string

        this.whereOrderByHandler(graphParentType.extensions?.dbTableName, `t${this.currentTableIndex}`, args);

        // Push the root table into the iterator
        // Iterator is recursive so it should grab everything
        const hydrationDefinition: any = this.turnGraphNodeIntoSql(
            resolveInfo.fieldNodes[0].selectionSet?.selections ?? [],
            graphReturnType.getFields(),
            primaryKeys,
            args
        );

        // Handle orderBy
        if (!IsHelper.isEmptyArray(this.orderByList)) {
            this.query.orderBy(this.orderByList);
        }

        return {
            workerName: this.databaseWorker.name,
            sql: this.query.toString(),
            hydrationDefinition,
        };
    };

    private paginateSubObjects = (data: any) => {
        for (const key in data) {
            // eslint-disable-next-line no-prototype-builtins
            if (data.hasOwnProperty(key)) {
                if (this.objPagination.some((x) => x.key === key)) {
                    const pageObject = this.objPagination.find((x) => x.key === key);
                    if (!IsHelper.isNullOrUndefined(pageObject)) {
                        data[key] = data[key].slice(
                            (pageObject.page - 1) * pageObject.limit,
                            pageObject.page * pageObject.limit
                        );
                    }
                }
                if (Array.isArray(data[key])) {
                    for (const subData of data[key]) {
                        this.paginateSubObjects(subData);
                    }
                }
            }
        }
    };

    private turnGraphNodeIntoSql = (
        selections: readonly SelectionNode[],
        selectionFields: GraphQLFieldMap<any, any>,
        primaryKeys: any[],
        args: any,
        parentTable?: ConverterDatabaseTable
    ): any => {
        // Set up return hydration object
        const returnHydration: any = {};

        // Get max limit
        const maxLimitSetting = this.databaseWorker.metadata.rowLimit;
        let maxLimit: number = 100000;

        if (
            !IsHelper.isNullOrUndefined(maxLimitSetting) &&
            IsHelper.isNumber(maxLimitSetting) &&
            +maxLimitSetting !== 0
        ) {
            maxLimit = +maxLimitSetting;
        }

        // Handle first pass
        if (IsHelper.isNullOrUndefined(parentTable)) {
            let pageNumber = 1;

            if (!IsHelper.isNullOrUndefined(args.whereMode)) {
                this.whereMode = args.whereMode;
            }

            _.forOwn(args, (value: any, key: any) => {
                if (key === "dbLimit") {
                    maxLimit = value;
                }

                if (key === "dbPage") {
                    pageNumber = value;
                }

                if (key === "objLimit") {
                    throw Error(
                        "Only subqueries can contain the objLimit argument. Use dbLimit to limit the main query table."
                    );
                }

                if (key === "objPage") {
                    throw Error(
                        "Only subqueries can contain the objPage argument. Use dbPage to go to the page of the main query table."
                    );
                }
            });

            this.query.limit(maxLimit);
            this.query.offset((pageNumber - 1) * maxLimit);

            parentTable = this.tables[0];
        }

        // Get table for reference
        const table: ConverterDatabaseTable = this.tables[this.currentTableIndex];

        // Primary keys must ALWAYS be pushed in for every table so the hydrator will
        // work.  They must also be pushed in FIRST.  We will ignore the primary keys
        // later if the query has requested it.

        const graphParentType: GraphQLObjectType = (this.parentPath.type as GraphQLList<GraphQLObjectType>).ofType;

        if (IsHelper.isNullOrUndefined(graphParentType.extensions?.aggregateType)) {
            primaryKeys.forEach((primaryKey) => {
                returnHydration[primaryKey.name] = { column: `f${this.currentFieldIndex}`, id: true };
                this.query.select(
                    `${table.tableAlias}.${primaryKey.extensions.dbColumnName} as f${this.currentFieldIndex}`
                );
                this.currentFieldIndex++;
            });

            // Get the selection fields that are actual fields, push them into the catcher interface,
            // and add them to the select.  Ignore the primary key if it is in the query.
            const fields: SelectionNode[] = selections.filter((selection: SelectionNode) =>
                IsHelper.isUndefined((selection as FieldNode).selectionSet)
            );

            fields.forEach((selection: SelectionNode) => {
                const graphField: GraphQLField<any, any> = _.get(selectionFields, (selection as FieldNode).name.value);

                if (!primaryKeys.some((key) => key.extensions.dbColumnName === graphField.extensions?.dbColumnName)) {
                    returnHydration[graphField.name] = { column: `f${this.currentFieldIndex}` };
                    this.query.select(
                        `${table.tableAlias}.${graphField.extensions?.dbColumnName} as f${this.currentFieldIndex}`
                    );
                    this.currentFieldIndex++;
                }
            });
        } else {
            const aggTypes: SelectionNode[] = selections.filter(
                (sel: SelectionNode) =>
                    !(sel as FieldNode).name.value.startsWith("to") && !(sel as FieldNode).name.value.startsWith("from")
            );

            aggTypes.forEach((agg: SelectionNode) => {
                const aggFieldNode: FieldNode = agg as FieldNode;

                if (!IsHelper.isNullOrUndefined(aggFieldNode.arguments) && aggFieldNode.arguments.length > 1) {
                    throw new Error("Only one argument allowed for aggregate functions.");
                } else {
                    const knexFunctionField: GraphQLField<any, any> = _.filter(
                        selectionFields,
                        (field) => field.name === aggFieldNode.name.value
                    )[0];
                    const knexFunction: string = knexFunctionField.extensions?.knexFunction;

                    const dbFieldName = knexFunctionField.args.filter((arg) => {
                        if (
                            !IsHelper.isNullOrUndefined(aggFieldNode) &&
                            !IsHelper.isNullOrUndefined(aggFieldNode.arguments) &&
                            aggFieldNode.arguments.length > 0
                        ) {
                            return arg.name === aggFieldNode.arguments[0].name.value;
                        } else {
                            return undefined;
                        }
                    })[0].extensions?.dbColumnName;

                    if (knexFunction !== "count" && IsHelper.isNullOrUndefined(dbFieldName)) {
                        throw new Error("This aggregate function requires one argument.");
                    } else {
                        returnHydration[knexFunction] = { column: `f${this.currentFieldIndex}` };

                        const aggString: string = `${dbFieldName ? table.tableAlias + "." + dbFieldName : "*"} as f${
                            this.currentFieldIndex
                        }`;

                        switch (knexFunction) {
                            case "count":
                                this.query.count(aggString);
                                break;
                            case "countDistinct":
                                this.query.countDistinct(aggString);
                                break;
                            case "min":
                                this.query.min(aggString);
                                break;
                            case "max":
                                this.query.max(aggString);
                                break;
                            case "sum":
                                this.query.sum(aggString);
                                break;
                            case "sumDistinct":
                                this.query.sumDistinct(aggString);
                                break;
                            case "avg":
                                this.query.avg(aggString);
                                break;
                            case "avgDistinct":
                                this.query.avgDistinct(aggString);
                                break;
                        }

                        this.currentFieldIndex++;
                    }
                }
            });
        }

        // Get the selection fields that are joins
        const subTables: SelectionNode[] = selections.filter(
            (selection: SelectionNode) => (selection as FieldNode).selectionSet !== undefined
        );

        if (!IsHelper.isNullOrUndefined(subTables) && !IsHelper.isEmptyArray(subTables)) {
            this.currentTableIndex++;
        }

        subTables.forEach((selection: SelectionNode) => {
            const graphField: GraphQLField<any, any> = _.get(selectionFields, `${(selection as FieldNode).name.value}`);

            // Get all the subfields.  Different permutation if it is a many to one or one to many
            let subFields: GraphQLFieldMap<any, any> = {};

            if (graphField.type instanceof GraphQLList) {
                subFields = (graphField.type as GraphQLList<GraphQLObjectType>).ofType.getFields(); // One to many from GraphQLList
            } else if (graphField.type instanceof GraphQLObjectType) {
                subFields = graphField.type.getFields(); // Many to one from GraphQLObject
            }

            // Grab the join's primary key for the recursion
            const subPrimaryKey: any[] = _.filter(subFields, (field: any) => {
                return (
                    field.extensions.dbColumnName !== undefined &&
                    !field.name.toString().startsWith("from_") &&
                    !field.name.toString().startsWith("to_") &&
                    field.extensions.dbColumnName === graphField.extensions?.dbJoinForeignTablePrimaryKey
                );
            });

            // Push into the catcher interface
            const subTable: ConverterDatabaseTable = {
                index: this.currentTableIndex,
                graphPath: IsHelper.isEmptyStringOrWhitespace(parentTable?.graphPath)
                    ? graphField.name
                    : parentTable?.graphPath + "." + graphField.name,
                tableAlias: `t${this.currentTableIndex}`,
                tableName: graphField.extensions?.dbTableName,
            };

            this.tables.push(subTable);

            const currentTableIndex = this.currentTableIndex;
            const knexObj = this.knex;
            const dbNames = (selection as FieldNode).arguments?.map((arg: any) => ({
                name: arg.name.value,
                dbName: this.getDbColumnName(graphField, arg),
            }));
            const whereMode = this.whereMode;

            // Build the join based off of the field properties
            if (graphField.name.toString().startsWith("from_")) {
                this.query.leftJoin(`${graphField.extensions?.dbTableName} as t${this.currentTableIndex}`, function () {
                    this.on(
                        `${parentTable?.tableAlias}.${graphField.extensions?.dbJoinForeignColumn}`,
                        "=",
                        `t${currentTableIndex}.${graphField.extensions?.dbJoinPrimaryColumn}`
                    );

                    if (whereMode === WhereMode.Specific) {
                        (selection as FieldNode).arguments?.forEach((args: any) => {
                            const dbName = dbNames?.find(
                                (x: { name: string; dbName: string }) => x.name === args.name.value
                            )?.dbName;

                            if (!IsHelper.isNullOrUndefined(dbName)) {
                                const conditions = args.value.value.split("||");

                                this.andOn(function () {
                                    conditions.forEach((cond: string) =>
                                        this.orOn(knexObj.raw(`t${currentTableIndex}.${dbName} ${cond}`))
                                    );
                                });
                            }
                        });
                    }
                });
            }

            if (graphField.name.toString().startsWith("to_")) {
                this.query.leftJoin(`${graphField.extensions?.dbTableName} as t${this.currentTableIndex}`, function () {
                    this.on(
                        `${parentTable?.tableAlias}.${graphField.extensions?.dbJoinPrimaryColumn}`,
                        "=",
                        `t${currentTableIndex}.${graphField.extensions?.dbJoinForeignColumn}`
                    );

                    if (whereMode === WhereMode.Specific) {
                        (selection as FieldNode).arguments?.forEach((args: any) => {
                            const dbName = dbNames?.find(
                                (x: { name: string; dbName: string }) => x.name === args.name.value
                            )?.dbName;

                            if (!IsHelper.isNullOrUndefined(dbName)) {
                                const conditions = args.value.value.split("||");

                                this.andOn(function () {
                                    conditions.forEach((cond: string) =>
                                        this.orOn(knexObj.raw(`t${currentTableIndex}.${dbName} ${cond}`))
                                    );
                                });
                            }
                        });
                    }
                });
            }

            // Since we're in a "subtable", there could be arguments (where, orderby, etc), so build those
            const subArgs: any = {};

            _.forEach((selection as FieldNode).arguments, (arg: any) => {
                if (arg.name.value === "objPage" || arg.name.value === "objLimit") {
                    if (this.objPagination.some((x) => x.key === graphField.name)) {
                        const foundPageObject = this.objPagination.find((x) => x.key === graphField.name);
                        if (foundPageObject) {
                            if (arg.name.value === "objLimit") {
                                foundPageObject.limit = arg.value.value;
                            } else if (arg.name.value === "objPage") {
                                foundPageObject.page = arg.value.value;
                            }
                        }
                    } else if (arg.name.value === "objLimit") {
                        this.objPagination.push({
                            key: graphField.name,
                            tableName: graphField.extensions?.dbTableName,
                            page: 1,
                            limit: arg.value.value,
                        });
                    } else if (arg.name.value === "objPage") {
                        this.objPagination.push({
                            key: graphField.name,
                            tableName: graphField.extensions?.dbTableName,
                            page: arg.value.value,
                            limit: 0,
                        });
                    }
                }

                const dbColumnName = this.getDbColumnName(graphField, arg);

                if (arg.name.value !== "objLimit" && arg.name.value !== "objPage") {
                    subArgs[dbColumnName] = arg.value.value;
                }
            });

            if (!_.isEmpty(subArgs) && this.whereMode === WhereMode.All) {
                this.whereOrderByHandler(graphField.extensions?.dbTableName, `t${this.currentTableIndex}`, subArgs);
            }

            // Recursion
            const subHydration: any = this.turnGraphNodeIntoSql(
                (selection as FieldNode).selectionSet?.selections ?? [],
                subFields,
                subPrimaryKey,
                subArgs,
                subTable
            );

            // Push in hydration based off of join syntax
            if (graphField.name.toString().startsWith("from_")) {
                returnHydration[graphField.name] = [];
                returnHydration[graphField.name].push(subHydration);
            }

            if (graphField.name.toString().startsWith("to_")) {
                returnHydration[graphField.name] = subHydration;
            }

            // Iterate
            if (this.tables.some((ctable: ConverterDatabaseTable) => ctable.index === this.currentTableIndex)) {
                this.currentTableIndex++;
            }
        });

        // Give back hydration
        return returnHydration;
    };

    public whereOrderByHandler = (tableName: string, tableAlias: string, args: any): void => {
        if (IsHelper.isNullOrUndefined(args) || IsHelper.isEmptyObject(args)) {
            return;
        }

        const schema: ConnectionSchema | undefined = global.omnihive.registeredSchemas.find(
            (value: ConnectionSchema) => value.workerName === this.databaseWorker.name
        );

        let tableSchema: TableSchema[] = [];

        if (!IsHelper.isNullOrUndefined(schema)) {
            tableSchema = schema.tables;
        }

        tableSchema = tableSchema.filter((tableSchema: TableSchema) => tableSchema.tableName === tableName);

        const validArgs: any = {};

        Object.keys(args).forEach((key: string) => {
            if (key !== "dbPage" && key !== "dbLimit" && key !== "objPage" && key !== "objLimit") {
                validArgs[key] = args[key].toString();
            }
        });

        Object.keys(validArgs).forEach((key: string) => {
            let columnSchema: TableSchema | undefined = tableSchema.find((column: TableSchema) => {
                return column.columnNameDatabase === key;
            });

            if (IsHelper.isNullOrUndefined(columnSchema)) {
                columnSchema = tableSchema.find((column: TableSchema) => {
                    return column.columnNameEntity === key;
                });
            }

            if (IsHelper.isNullOrUndefined(columnSchema)) {
                return;
            }

            const whereRootSplitter: string[] = validArgs[key].toString().split("||");
            const whereArgs: string[] = whereRootSplitter
                .filter((splitterString: string) => !splitterString.toLowerCase().includes("orderby"))
                .map((x) => x.trim());
            const orderByArgs: string[] = whereRootSplitter
                .filter((splitterString: string) => splitterString.toLowerCase().includes("orderby"))
                .map((y) => y.trim());

            orderByArgs.forEach((orderBy: string) => {
                if (!IsHelper.isNullOrUndefined(columnSchema)) {
                    this.orderByList.push({
                        column: `${tableAlias}.${columnSchema.columnNameDatabase}`,
                        order: orderBy.includes("asc") ? "asc" : "desc",
                    });
                }
            });

            if (this.whereHitCounter === 0) {
                this.query.where((subWhereBuilder) => {
                    whereArgs.forEach((whereSub: string, subIndex: number) => {
                        if (subIndex === 0) {
                            if (!IsHelper.isEmptyStringOrWhitespace(tableAlias)) {
                                subWhereBuilder.whereRaw(
                                    tableAlias + "." + columnSchema?.columnNameDatabase + " " + whereSub
                                );
                            } else {
                                subWhereBuilder.whereRaw(columnSchema?.columnNameDatabase + " " + whereSub);
                            }
                        } else {
                            if (!IsHelper.isEmptyStringOrWhitespace(tableAlias)) {
                                subWhereBuilder.orWhereRaw(
                                    tableAlias + "." + columnSchema?.columnNameDatabase + " " + whereSub
                                );
                            } else {
                                subWhereBuilder.orWhereRaw(columnSchema?.columnNameDatabase + " " + whereSub);
                            }
                        }
                    });
                });
            } else {
                this.query.andWhere((subWhereBuilder) => {
                    whereArgs.forEach((whereSub: string, subIndex: number) => {
                        if (subIndex === 0) {
                            if (!IsHelper.isEmptyStringOrWhitespace(tableAlias)) {
                                subWhereBuilder.whereRaw(
                                    tableAlias + "." + columnSchema?.columnNameDatabase + " " + whereSub
                                );
                            } else {
                                subWhereBuilder.whereRaw(columnSchema?.columnNameDatabase + " " + whereSub);
                            }
                        } else {
                            if (!IsHelper.isEmptyStringOrWhitespace(tableAlias)) {
                                subWhereBuilder.orWhereRaw(
                                    tableAlias + "." + columnSchema?.columnNameDatabase + " " + whereSub
                                );
                            } else {
                                subWhereBuilder.orWhereRaw(columnSchema?.columnNameDatabase + " " + whereSub);
                            }
                        }
                    });
                });
            }

            this.whereHitCounter++;
        });
    };

    private getDbColumnName = (graphField: any, arg: any): string => {
        let dbColumnName: string = "";
        if (!IsHelper.isNullOrUndefined(graphField.extensions?.aggregateType)) {
            dbColumnName = graphField.args.filter((field: GraphQLArgument) => field.name === arg.name.value)[0]
                .extensions?.dbColumnName;
        } else {
            if (
                graphField.name.toString().startsWith("from_") &&
                arg.name.value !== "objPage" &&
                arg.name.value !== "objLimit"
            ) {
                dbColumnName = _.filter(
                    (graphField.type as GraphQLList<GraphQLObjectType>).ofType.getFields(),
                    (field: GraphQLField<any, any>) => field.name === arg.name.value
                )[0].extensions?.dbColumnName;
            }

            if (
                graphField.name.toString().startsWith("to_") &&
                arg.name.value !== "objPage" &&
                arg.name.value !== "objLimit"
            ) {
                dbColumnName = _.filter(
                    (graphField.type as GraphQLObjectType).getFields(),
                    (field: GraphQLField<any, any>) => field.name === arg.name.value
                )[0].extensions?.dbColumnName;
            }
        }

        return dbColumnName;
    };
}
