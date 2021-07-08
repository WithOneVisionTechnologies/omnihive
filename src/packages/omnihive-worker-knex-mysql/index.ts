/// <reference path="../../types/globals.omnihive.d.ts" />

import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { OmniHiveLogLevel } from "@withonevision/omnihive-core/enums/OmniHiveLogLevel";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { StringBuilder } from "@withonevision/omnihive-core/helpers/StringBuilder";
import { IDatabaseWorker } from "@withonevision/omnihive-core/interfaces/IDatabaseWorker";
import { ILogWorker } from "@withonevision/omnihive-core/interfaces/ILogWorker";
import { ConnectionSchema } from "@withonevision/omnihive-core/models/ConnectionSchema";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import { HiveWorkerMetadataDatabase } from "@withonevision/omnihive-core/models/HiveWorkerMetadataDatabase";
import { ProcFunctionSchema } from "@withonevision/omnihive-core/models/ProcFunctionSchema";
import { TableSchema } from "@withonevision/omnihive-core/models/TableSchema";
import knex, { Knex } from "knex";
import { serializeError } from "serialize-error";
import fse from "fs-extra";
import path from "path";
import mysql from "mysql2";
import { Pool } from "mysql2/promise";
import orderBy from "lodash.orderby";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";

export default class MySqlDatabaseWorker extends HiveWorkerBase implements IDatabaseWorker {
    public connection!: Knex;
    private connectionPool!: Pool;
    private sqlConfig!: any;
    private typedMetadata!: HiveWorkerMetadataDatabase;

    constructor() {
        super();
    }

    public async init(name: string, metadata?: any): Promise<void> {
        try {
            await AwaitHelper.execute(super.init(name, metadata));
            this.typedMetadata = this.checkObjectStructure<HiveWorkerMetadataDatabase>(
                HiveWorkerMetadataDatabase,
                metadata
            );

            this.sqlConfig = {
                host: this.typedMetadata.serverAddress,
                port: this.typedMetadata.serverPort,
                database: this.typedMetadata.databaseName,
                user: this.typedMetadata.userName,
                password: this.typedMetadata.password,
            };

            if (this.typedMetadata.requireSsl) {
                if (IsHelper.isEmptyStringOrWhitespace(this.typedMetadata.sslCertPath)) {
                    this.sqlConfig.ssl = this.typedMetadata.requireSsl;
                } else {
                    this.sqlConfig.ssl = {
                        ca: fse.readFileSync(this.typedMetadata.sslCertPath).toString(),
                    };
                }
            }

            this.connectionPool = mysql
                .createPool({
                    ...this.sqlConfig,
                    connectionLimit: this.typedMetadata.connectionPoolLimit,
                    multipleStatements: true,
                })
                .promise();

            const connectionOptions: Knex.Config = {
                connection: {},
                pool: { min: 0, max: this.typedMetadata.connectionPoolLimit },
            };
            connectionOptions.client = "mysql2";
            connectionOptions.connection = this.sqlConfig;
            this.connection = knex(connectionOptions);
        } catch (err) {
            throw new Error("MySQL Init Error => " + JSON.stringify(serializeError(err)));
        }
    }

    public executeQuery = async (query: string, disableLog?: boolean): Promise<any[][]> => {
        if (IsHelper.isNullOrUndefined(disableLog) || !disableLog) {
            const logWorker: ILogWorker | undefined = this.getWorker<ILogWorker | undefined>(HiveWorkerType.Log);
            logWorker?.write(OmniHiveLogLevel.Info, query);
        }

        const result: any = await AwaitHelper.execute(this.connectionPool.query(query));

        const returnResults: any[][] = [];
        let currentResultIndex: number = 0;

        if (!Array.isArray(result[0][0])) {
            returnResults[currentResultIndex] = result[0];
            return returnResults;
        }

        for (let r of result[0]) {
            returnResults[currentResultIndex] = r;
            currentResultIndex++;
        }

        return returnResults;
    };

    public executeProcedure = async (
        procFunctionSchema: ProcFunctionSchema[],
        args: { name: string; value: any; isString: boolean }[]
    ): Promise<any[][]> => {
        const builder: StringBuilder = new StringBuilder();

        builder.append(`call `);
        builder.append(procFunctionSchema[0].name);

        builder.append("(");

        orderBy(procFunctionSchema, ["parameterOrder"], ["asc"]).forEach(
            (schema: ProcFunctionSchema, index: number) => {
                const arg: { name: string; value: any; isString: boolean } | undefined = args.find(
                    (arg) => arg.name === schema.parameterName
                );

                if (!IsHelper.isNullOrUndefined(arg)) {
                    builder.append(`${arg.isString ? `'` : ""}${arg.value}${arg.isString ? `'` : ""}`);
                }

                if (index < args.length - 1) {
                    builder.append(`, `);
                }
            }
        );

        builder.append(")");

        const results: any[][] = await AwaitHelper.execute(this.executeQuery(builder.outputString()));
        results.pop();
        return results;
    };

    public getSchema = async (): Promise<ConnectionSchema> => {
        const result: ConnectionSchema = {
            workerName: this.name,
            tables: [],
            procFunctions: [],
        };

        let tableResult: any[][], procResult: any[][];
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

        try {
            const procFilePath = global.omnihive.getFilePath(this.typedMetadata.getProcFunctionSqlFile);

            if (
                !IsHelper.isNullOrUndefined(this.typedMetadata.getProcFunctionSqlFile) &&
                !IsHelper.isEmptyStringOrWhitespace(this.typedMetadata.getProcFunctionSqlFile) &&
                fse.existsSync(procFilePath)
            ) {
                procResult = await AwaitHelper.execute(this.executeQuery(fse.readFileSync(procFilePath, "utf8"), true));
            } else {
                if (
                    !IsHelper.isNullOrUndefined(this.typedMetadata.getProcFunctionSqlFile) &&
                    !IsHelper.isEmptyStringOrWhitespace(this.typedMetadata.getProcFunctionSqlFile)
                ) {
                    logWorker?.write(OmniHiveLogLevel.Warn, "Provided Proc SQL File is not found.");
                }
                if (fse.existsSync(path.join(__dirname, "defaultProcFunctions.sql"))) {
                    procResult = await AwaitHelper.execute(
                        this.executeQuery(
                            fse.readFileSync(path.join(__dirname, "defaultProcFunctions.sql"), "utf8"),
                            true
                        )
                    );
                } else {
                    throw new Error(`Cannot find a proc executor for ${this.name}`);
                }
            }
        } catch (err) {
            throw new Error("Schema SQL File Location not found: " + JSON.stringify(serializeError(err)));
        }

        tableResult[tableResult.length - 1].forEach((row) => {
            if (
                !this.typedMetadata.ignoreSchema &&
                !this.typedMetadata.schemas.includes("*") &&
                !this.typedMetadata.schemas.includes(row.schema_name)
            ) {
                return;
            }

            const schemaRow = new TableSchema();

            schemaRow.schemaName = row.schema_name;
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

        procResult[procResult.length - 1].forEach((row) => {
            if (
                !this.typedMetadata.ignoreSchema &&
                !this.typedMetadata.schemas.includes("*") &&
                !this.typedMetadata.schemas.includes(row.procfunc_schema)
            ) {
                return;
            }

            const schemaRow = new ProcFunctionSchema();

            schemaRow.schemaName = row.procfunc_schema;
            schemaRow.name = row.procfunc_name;
            schemaRow.type = row.procfunc_type;
            schemaRow.parameterOrder = row.parameter_order;
            schemaRow.parameterName = row.parameter_name;
            schemaRow.parameterTypeDatabase = row.parameter_type_database;
            schemaRow.parameterTypeEntity = row.parameter_type_entity;

            result.procFunctions.push(schemaRow);
        });

        return result;
    };
}
