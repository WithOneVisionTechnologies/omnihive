import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { OmniHiveLogLevel } from "@withonevision/omnihive-core/enums/OmniHiveLogLevel";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { StringBuilder } from "@withonevision/omnihive-core/helpers/StringBuilder";
import { StringHelper } from "@withonevision/omnihive-core/helpers/StringHelper";
import { IDatabaseWorker } from "@withonevision/omnihive-core/interfaces/IDatabaseWorker";
import { ILogWorker } from "@withonevision/omnihive-core/interfaces/ILogWorker";
import { ConnectionSchema } from "@withonevision/omnihive-core/models/ConnectionSchema";
import { HiveWorker } from "@withonevision/omnihive-core/models/HiveWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import { HiveWorkerMetadataDatabase } from "@withonevision/omnihive-core/models/HiveWorkerMetadataDatabase";
import { ProcSchema } from "@withonevision/omnihive-core/models/ProcSchema";
import { TableSchema } from "@withonevision/omnihive-core/models/TableSchema";
import knex, { Knex } from "knex";
import sql from "mssql";
import { serializeError } from "serialize-error";
import fse from "fs-extra";
import path from "path";

export default class MssqlDatabaseWorker extends HiveWorkerBase implements IDatabaseWorker {
    public connection!: Knex;
    private connectionPool!: sql.ConnectionPool;
    private sqlConfig!: sql.config;
    private metadata!: HiveWorkerMetadataDatabase;

    constructor() {
        super();
    }

    public async init(config: HiveWorker): Promise<void> {
        try {
            await AwaitHelper.execute(super.init(config));
            this.metadata = this.checkObjectStructure<HiveWorkerMetadataDatabase>(
                HiveWorkerMetadataDatabase,
                config.metadata
            );

            this.sqlConfig = {
                user: this.metadata.userName,
                password: this.metadata.password,
                server: this.metadata.serverAddress,
                port: this.metadata.serverPort,
                database: this.metadata.databaseName,
                options: {
                    enableArithAbort: true,
                    encrypt: false,
                },
            };

            this.connectionPool = new sql.ConnectionPool(this.sqlConfig);
            await AwaitHelper.execute(this.connectionPool.connect());

            const connectionOptions: Knex.Config = { connection: {}, pool: { min: 0, max: 150 } };
            connectionOptions.client = "mssql";
            connectionOptions.connection = this.sqlConfig;
            this.connection = knex(connectionOptions);
        } catch (err) {
            throw new Error("MSSQL Init Error => " + JSON.stringify(serializeError(err)));
        }
    }

    public executeQuery = async (query: string, disableLog?: boolean): Promise<any[][]> => {
        if (disableLog === null || disableLog === undefined || disableLog === false) {
            const logWorker: ILogWorker | undefined = this.getWorker<ILogWorker | undefined>(HiveWorkerType.Log);
            logWorker?.write(OmniHiveLogLevel.Info, query);
        }

        const poolRequest = this.connectionPool.request();
        const result = await AwaitHelper.execute(poolRequest.query(query));
        return result.recordsets;
    };

    public executeProcedure = async (
        procSchema: ProcSchema,
        args: { name: string; value: any; isString: boolean }[]
    ): Promise<any[][]> => {
        const builder: StringBuilder = new StringBuilder();

        builder.append(`exec `);

        if (!procSchema.procSchema || procSchema.procSchema === "") {
            builder.append(`dbo.` + procSchema.procName + ` `);
        } else {
            builder.append(procSchema.procSchema + `.` + procSchema.procName + ` `);
        }

        args.forEach((arg: { name: string; value: any; isString: boolean }, index: number) => {
            builder.append(`@${arg.name}=${arg.isString ? `'` : ""}${arg.value}${arg.isString ? `'` : ""}`);

            if (index < args.length - 1) {
                builder.append(`, `);
            }
        });

        return this.executeQuery(builder.outputString());
    };

    public getSchema = async (): Promise<ConnectionSchema> => {
        const result: ConnectionSchema = {
            workerName: this.config.name,
            tables: [],
            procs: [],
        };

        let tableResult: any[][], procResult: any[][];

        if (this.metadata.tableSchemaExecutor && !StringHelper.isNullOrWhiteSpace(this.metadata.tableSchemaExecutor)) {
            tableResult = await AwaitHelper.execute(
                this.executeQuery(`exec ${this.metadata.tableSchemaExecutor}`, true)
            );
        } else {
            if (fse.existsSync(path.join(__dirname, "defaultTables.sql"))) {
                tableResult = await AwaitHelper.execute(
                    this.executeQuery(fse.readFileSync(path.join(__dirname, "defaultTables.sql"), "utf8"), true)
                );
            } else {
                throw new Error(`Cannot find a table executor for ${this.config.name}`);
            }
        }

        if (this.metadata.procSchemaExecutor && !StringHelper.isNullOrWhiteSpace(this.metadata.procSchemaExecutor)) {
            procResult = await AwaitHelper.execute(this.executeQuery(`exec ${this.metadata.procSchemaExecutor}`, true));
        } else {
            if (fse.existsSync(path.join(__dirname, "defaultProcs.sql"))) {
                procResult = await AwaitHelper.execute(
                    this.executeQuery(fse.readFileSync(path.join(__dirname, "defaultProcs.sql"), "utf8"), true)
                );
            } else {
                throw new Error(`Cannot find a proc executor for ${this.config.name}`);
            }
        }

        tableResult[0].forEach((row) => {
            if (!this.metadata.ignoreSchema && !this.metadata.schemas.includes(row.schema_name)) {
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

        procResult[0].forEach((row) => {
            if (!this.metadata.ignoreSchema && !this.metadata.schemas.includes(row.proc_schema)) {
                return;
            }

            const schemaRow = new ProcSchema();

            schemaRow.procSchema = row.schema_name;
            schemaRow.procName = row.proc_name;
            schemaRow.parameterId = row.parameter_id;
            schemaRow.parameterName = row.parameter_name;
            schemaRow.parameterTypeDatabase = row.parameter_type_database;
            schemaRow.parameterTypeEntity = row.parameter_type_entity;
            schemaRow.parameterMaxBytes = row.parameter_max_bytes;

            result.procs.push(schemaRow);
        });

        return result;
    };
}
