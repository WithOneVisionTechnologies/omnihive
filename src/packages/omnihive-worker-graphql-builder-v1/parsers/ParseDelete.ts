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

export class ParseDelete {
    public parse = async (
        workerName: string,
        tableName: string,
        whereObject: any,
        _customDmlArgs: any,
        omniHiveContext: GraphContext
    ): Promise<number> => {
        if (!whereObject || Object.keys(whereObject).length === 0) {
            throw new Error("Delete cannot have no where objects/clause.  That is too destructive.");
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
        queryBuilder.from(tableName);

        Object.keys(whereObject).forEach((key: string, index: number) => {
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

            const whereSplitter: string[] = whereObject[key].toString().split("||");

            if (index === 0 && whereSplitter.length === 1) {
                queryBuilder.whereRaw(`${columnSchema.columnNameDatabase} ${whereObject[key]}`);
            }

            if (index > 0 && whereSplitter.length === 1) {
                queryBuilder.andWhereRaw(`${columnSchema.columnNameDatabase} ${whereObject[key]}`);
            }

            if (index === 0 && whereSplitter.length > 1) {
                queryBuilder.where((subWhere) => {
                    whereSplitter.forEach((split, subIndex) => {
                        if (subIndex === 0) {
                            subWhere.whereRaw(`${columnSchema?.columnNameDatabase} ${split}`);
                        } else {
                            subWhere.orWhereRaw(`${columnSchema?.columnNameDatabase} ${split}`);
                        }
                    });
                });
            }

            if (index > 0 && whereSplitter.length > 1) {
                queryBuilder.andWhere((subWhere) => {
                    whereSplitter.forEach((split, subIndex) => {
                        if (subIndex === 0) {
                            subWhere.whereRaw(`${columnSchema?.columnNameDatabase} ${split}`);
                        } else {
                            subWhere.orWhereRaw(`${columnSchema?.columnNameDatabase} ${split}`);
                        }
                    });
                });
            }
        });

        return await queryBuilder.del();
    };
}
