/// <reference path="../../types/globals.omnihive.d.ts" />

import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { OmniHiveLogLevel } from "@withonevision/omnihive-core/enums/OmniHiveLogLevel";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IDatabaseWorker } from "@withonevision/omnihive-core/interfaces/IDatabaseWorker";
import { ILogWorker } from "@withonevision/omnihive-core/interfaces/ILogWorker";
import { ConnectionSchema } from "@withonevision/omnihive-core/models/ConnectionSchema";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import { ProcFunctionSchema } from "@withonevision/omnihive-core/models/ProcFunctionSchema";
import { TableSchema } from "@withonevision/omnihive-core/models/TableSchema";
import knex, { Knex } from "knex";
import { serializeError } from "serialize-error";
import fse from "fs-extra";
import path from "path";
import { HiveWorkerMetadataDatabase } from "@withonevision/omnihive-core/models/HiveWorkerMetadataDatabase";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";

export class SqliteWorkerMetadata extends HiveWorkerMetadataDatabase {
    public filename: string = "";
}

export default class MySqlDatabaseWorker extends HiveWorkerBase implements IDatabaseWorker {
    public connection!: Knex;
    private typedMetadata!: SqliteWorkerMetadata;

    constructor() {
        super();
    }

    public async init(name: string, metadata?: any): Promise<void> {
        const sqliteMetadata: SqliteWorkerMetadata = metadata as SqliteWorkerMetadata;

        sqliteMetadata.ignoreSchema = true;
        sqliteMetadata.password = "";
        sqliteMetadata.getProcFunctionSqlFile = "";
        sqliteMetadata.procFunctionGraphSchemaName = "";
        sqliteMetadata.requireSsl = false;
        sqliteMetadata.schemas = [];
        sqliteMetadata.serverAddress = "";
        sqliteMetadata.serverPort = 9999;
        sqliteMetadata.sslCertPath = "";
        sqliteMetadata.userName = "";

        try {
            await AwaitHelper.execute(super.init(name, metadata));
            this.typedMetadata = this.checkObjectStructure<SqliteWorkerMetadata>(SqliteWorkerMetadata, sqliteMetadata);

            if (!fse.existsSync(this.typedMetadata.filename)) {
                throw new Error("Sqlite database cannot be found");
            }

            const connectionOptions: Knex.Config = {
                client: "sqlite3",
                useNullAsDefault: true,
                connection: {
                    filename: this.typedMetadata.filename,
                },
            };
            this.connection = knex(connectionOptions);
        } catch (err) {
            throw new Error("Sqlite Init Error => " + JSON.stringify(serializeError(err)));
        }
    }

    public executeQuery = async (query: string, disableLog?: boolean): Promise<any[][]> => {
        if (IsHelper.isNullOrUndefined(disableLog) || !disableLog) {
            const logWorker: ILogWorker | undefined = this.getWorker<ILogWorker | undefined>(HiveWorkerType.Log);
            logWorker?.write(OmniHiveLogLevel.Info, query);
        }

        const result: any = await AwaitHelper.execute(this.connection.raw(query));

        const returnResults: any[][] = [];
        returnResults[0] = result;

        return returnResults;
    };

    public executeProcedure = async (
        _procFunctionSchema: ProcFunctionSchema[],
        _args: { name: string; value: any; isString: boolean }[]
    ): Promise<any[][]> => {
        return [];
    };

    public getSchema = async (): Promise<ConnectionSchema> => {
        const result: ConnectionSchema = {
            workerName: this.name,
            tables: [],
            procFunctions: [],
        };

        let tableResult: any[][];
        const logWorker: ILogWorker | undefined = this.getWorker<ILogWorker | undefined>(HiveWorkerType.Log);

        try {
            const tableFilePath = global.omnihive.getFilePath(this.typedMetadata.getSchemaSqlFile);

            if (
                !IsHelper.isNullOrUndefined(this.typedMetadata.getSchemaSqlFile) &&
                !IsHelper.isEmptyStringOrWhitespace(this.typedMetadata.getSchemaSqlFile) &&
                fse.existsSync(tableFilePath)
            ) {
                tableResult = await AwaitHelper.execute(
                    this.executeQuery(fse.readFileSync(tableFilePath, "utf8"), true)
                );
            } else {
                if (
                    !IsHelper.isNullOrUndefined(this.typedMetadata.getSchemaSqlFile) &&
                    !IsHelper.isEmptyStringOrWhitespace(this.typedMetadata.getSchemaSqlFile)
                ) {
                    logWorker?.write(OmniHiveLogLevel.Warn, "Provided Schema SQL File is not found.");
                }
                if (fse.existsSync(path.join(__dirname, "defaultTables.sql"))) {
                    tableResult = await AwaitHelper.execute(
                        this.executeQuery(fse.readFileSync(path.join(__dirname, "defaultTables.sql"), "utf8"), true)
                    );
                } else {
                    throw new Error(`Cannot find a table executor for ${this.name}`);
                }
            }
        } catch (err) {
            throw new Error("Schema SQL File Location not found: " + JSON.stringify(serializeError(err)));
        }

        tableResult[tableResult.length - 1].forEach((row) => {
            const schemaRow = new TableSchema();

            schemaRow.schemaName = "";
            schemaRow.tableName = row.table_name;
            schemaRow.columnNameDatabase = row.column_name_database;
            schemaRow.columnTypeDatabase = row.column_type_database;
            schemaRow.columnTypeEntity = row.column_type_entity;
            schemaRow.columnPosition = row.column_position;
            schemaRow.columnIsNullable = row.column_is_nullable;
            schemaRow.columnIsIdentity = row.column_is_identity;
            schemaRow.columnIsPrimaryKey = row.column_is_primary_key;
            schemaRow.columnIsForeignKey = row.column_is_foreign_key;
            schemaRow.columnForeignKeyTableName = row.column_foreign_key_table_name;
            schemaRow.columnForeignKeyColumnName = row.column_foreign_key_column_name;

            result.tables.push(schemaRow);
        });

        return result;
    };
}
