/// <reference path="../../../types/globals.omnihive.d.ts" />

import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { StringHelper } from "@withonevision/omnihive-core/helpers/StringHelper";
import { IDatabaseWorker } from "@withonevision/omnihive-core/interfaces/IDatabaseWorker";
import { IFeatureWorker } from "@withonevision/omnihive-core/interfaces/IFeatureWorker";
import { ITokenWorker } from "@withonevision/omnihive-core/interfaces/ITokenWorker";
import { ConnectionSchema } from "@withonevision/omnihive-core/models/ConnectionSchema";
import { GraphContext } from "@withonevision/omnihive-core/models/GraphContext";
import { TableSchema } from "@withonevision/omnihive-core/models/TableSchema";
import { Knex } from "knex";

export class ParseInsert {
    public parse = async (
        workerName: string,
        tableName: string,
        insertObjects: any[],
        _customDmlArgs: any,
        omniHiveContext: GraphContext
    ): Promise<any[]> => {
        if (!insertObjects || Object.keys(insertObjects).length === 0) {
            throw new Error("Insert cannot have a zero column count.");
        }

        const databaseWorker: IDatabaseWorker | undefined = global.omnihive.getWorker<IDatabaseWorker | undefined>(
            HiveWorkerType.Database,
            workerName
        );

        if (!databaseWorker) {
            throw new Error(
                "Database Worker Not Defined.  This graph converter will not work without a Database worker."
            );
        }

        const featureWorker: IFeatureWorker | undefined = global.omnihive.getWorker<IFeatureWorker | undefined>(
            HiveWorkerType.Feature
        );

        const disableSecurity: boolean = (await featureWorker?.get<boolean>("disableSecurity", false)) ?? false;

        const tokenWorker: ITokenWorker | undefined = global.omnihive.getWorker<ITokenWorker | undefined>(
            HiveWorkerType.Token
        );

        if (!disableSecurity && !tokenWorker) {
            throw new Error("[ohAccessError] No token worker defined.");
        }

        if (
            !disableSecurity &&
            tokenWorker &&
            (!omniHiveContext || !omniHiveContext.access || StringHelper.isNullOrWhiteSpace(omniHiveContext.access))
        ) {
            throw new Error("[ohAccessError] Access token is invalid or expired.");
        }

        if (
            !disableSecurity &&
            tokenWorker &&
            omniHiveContext &&
            omniHiveContext.access &&
            !StringHelper.isNullOrWhiteSpace(omniHiveContext.access)
        ) {
            const verifyToken: boolean = await AwaitHelper.execute<boolean>(tokenWorker.verify(omniHiveContext.access));
            if (verifyToken === false) {
                throw new Error("[ohAccessError] Access token is invalid or expired.");
            }
        }

        const schema: ConnectionSchema | undefined = global.omnihive.registeredSchemas.find(
            (value: ConnectionSchema) => value.workerName === workerName
        );
        let tableSchema: TableSchema[] = [];

        if (schema) {
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

                if (!columnSchema) {
                    columnSchema = tableSchema.find((column: TableSchema) => {
                        return column.columnNameEntity === key;
                    });
                }

                if (!columnSchema) {
                    return;
                }

                insertDbObject[columnSchema.columnNameDatabase] = insertObject[key];
            });

            insertDbObjects.push(insertDbObject);
        });

        return queryBuilder.insert(insertDbObjects, "*", { includeTriggerModifications: true }).into(tableName);
    };
}
