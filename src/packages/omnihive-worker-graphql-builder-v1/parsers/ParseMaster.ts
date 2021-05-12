import { ConnectionSchema } from "@withonevision/omnihive-core/models/ConnectionSchema";
import { GraphContext } from "@withonevision/omnihive-core/models/GraphContext";
import { TableSchema } from "@withonevision/omnihive-core/models/TableSchema";
import { GraphQLResolveInfo } from "graphql";
import { ParseAstQuery } from "./ParseAstQuery";
import { ParseCustomSql } from "./ParseCustomSql";
import { ParseDelete } from "./ParseDelete";
import { ParseInsert } from "./ParseInsert";
import { ParseStoredProcedure } from "./ParseStoredProcedure";
import { ParseUpdate } from "./ParseUpdate";

export class ParseMaster {
    public parseAstQuery = async (
        workerName: string,
        resolveInfo: GraphQLResolveInfo,
        omniHiveContext: GraphContext
    ): Promise<any> => {
        const parser: ParseAstQuery = new ParseAstQuery();
        return await parser.parse(workerName, resolveInfo, omniHiveContext);
    };

    public parseCustomSql = async (
        workerName: string,
        encryptedSql: string,
        omniHiveContext: GraphContext
    ): Promise<any[][]> => {
        const parser: ParseCustomSql = new ParseCustomSql();
        return await parser.parse(workerName, encryptedSql, omniHiveContext);
    };

    public parseDelete = async (
        workerName: string,
        tableName: string,
        whereObject: any,
        customDmlArgs: any,
        omniHiveContext: GraphContext
    ): Promise<number> => {
        const parser: ParseDelete = new ParseDelete();
        return await parser.parse(workerName, tableName, whereObject, customDmlArgs, omniHiveContext);
    };

    public parseInsert = async (
        workerName: string,
        tableName: string,
        insertObjects: any[],
        customDmlArgs: any,
        omniHiveContext: GraphContext
    ): Promise<any[]> => {
        const parser: ParseInsert = new ParseInsert();
        const results = await parser.parse(workerName, tableName, insertObjects, customDmlArgs, omniHiveContext);

        const schema: ConnectionSchema | undefined = global.omnihive.registeredSchemas.find(
            (value: ConnectionSchema) => value.workerName === workerName
        );
        let tableSchema: TableSchema[] = [];

        if (schema) {
            tableSchema = schema.tables;
        }
        tableSchema = tableSchema.filter((tableSchema: TableSchema) => tableSchema.tableName === tableName);

        for (let i = 0; i < results.length; i++) {
            const convertedResults: any = {};
            Object.keys(results[i]).forEach((x) => {
                const column = tableSchema.find((y) => y.columnNameDatabase === x);

                if (column) {
                    convertedResults[column.columnNameEntity] = results[i][x];
                } else {
                    convertedResults[x] = results[i][x];
                }
            });

            results[i] = convertedResults;
        }

        return results;
    };

    public parseStoredProcedure = async (
        workerName: string,
        resolveInfo: GraphQLResolveInfo,
        omniHiveContext: GraphContext
    ): Promise<{ procName: string; results: any[][] }[]> => {
        const parser: ParseStoredProcedure = new ParseStoredProcedure();
        return await parser.parse(workerName, resolveInfo, omniHiveContext);
    };

    public parseUpdate = async (
        workerName: string,
        tableName: string,
        updateObject: any,
        whereObject: any,
        customDmlArgs: any,
        omniHiveContext: GraphContext
    ): Promise<number> => {
        const parser: ParseUpdate = new ParseUpdate();
        return await parser.parse(workerName, tableName, updateObject, whereObject, customDmlArgs, omniHiveContext);
    };
}
