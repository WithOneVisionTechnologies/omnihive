/// <reference path="../../../types/globals.omnihive.d.ts" />

import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IDatabaseWorker } from "@withonevision/omnihive-core/interfaces/IDatabaseWorker";
import { ITokenWorker } from "@withonevision/omnihive-core/interfaces/ITokenWorker";
import { ConnectionSchema } from "@withonevision/omnihive-core/models/ConnectionSchema";
import { GraphContext } from "@withonevision/omnihive-core/models/GraphContext";
import { TableSchema } from "@withonevision/omnihive-core/models/TableSchema";
import { Knex } from "knex";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";

export class ParseInsert {
    public parse = async (
        workerName: string,
        tableName: string,
        insertObjects: any[],
        _customDmlArgs: any,
        omniHiveContext: GraphContext
    ): Promise<any[]> => {
        if (IsHelper.isNullOrUndefined(insertObjects) || IsHelper.isEmptyArray(insertObjects)) {
            throw new Error("Insert cannot have a zero column count.");
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

        const schema: ConnectionSchema | undefined = global.omnihive.registeredSchemas.find(
            (value: ConnectionSchema) => value.workerName === workerName
        );
        let tableSchema: TableSchema[] = [];

        if (!IsHelper.isNullOrUndefined(schema)) {
            tableSchema = schema.tables;
        }
        tableSchema = tableSchema.filter((tableSchema: TableSchema) => tableSchema.tableName === tableName);

        const queryBuilder: Knex.QueryBuilder = (databaseWorker.connection as Knex).queryBuilder();

        const insertDbObjects: any[] = [];

        insertObjects.forEach((insertObject: any) => {
            const insertDbObject: any = {};

            Object.keys(insertObject).forEach((key: string) => {
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

                insertDbObject[columnSchema.columnNameDatabase] = insertObject[key];
            });

            insertDbObjects.push(insertDbObject);
        });

        return queryBuilder.insert(insertDbObjects, "*", { includeTriggerModifications: true }).into(tableName);
    };
}
