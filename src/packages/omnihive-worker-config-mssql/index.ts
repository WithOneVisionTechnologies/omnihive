import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { HiveWorker } from "@withonevision/omnihive-core/models/HiveWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import knex, { Knex } from "knex";
import sql from "mssql";
import { serializeError } from "serialize-error";
import { IConfigWorker } from "@withonevision/omnihive-core/interfaces/IConfigWorker";
import { HiveWorkerMetadataConfigDatabase } from "@withonevision/omnihive-core/models/HiveWorkerMetadataConfigDatabase";
import { StringBuilder } from "@withonevision/omnihive-core/helpers/StringBuilder";
import { EnvironmentVariableType } from "@withonevision/omnihive-core/enums/EnvironmentVariableType";
import { EnvironmentVariable } from "@withonevision/omnihive-core/models/EnvironmentVariable";
import { AppSettings } from "@withonevision/omnihive-core/models/AppSettings";

export default class MssqlConfigWorker extends HiveWorkerBase implements IConfigWorker {
    public connection!: Knex;
    private connectionPool!: sql.ConnectionPool;
    private sqlConfig!: any;
    private metadata!: HiveWorkerMetadataConfigDatabase;

    private configId: number = 0;

    constructor() {
        super();
    }

    public async init(config: HiveWorker): Promise<void> {
        try {
            await AwaitHelper.execute(super.init(config));
            this.metadata = this.checkObjectStructure<HiveWorkerMetadataConfigDatabase>(
                HiveWorkerMetadataConfigDatabase,
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

            this.connectionPool = new sql.ConnectionPool({ ...this.sqlConfig });
            await AwaitHelper.execute(this.connectionPool.connect());

            const connectionOptions: Knex.Config = {
                connection: {},
                pool: { min: 0, max: 10 },
            };
            connectionOptions.client = "mssql";
            connectionOptions.connection = this.sqlConfig;
            this.connection = knex(connectionOptions);
        } catch (err) {
            throw new Error("MSSQL Init Error => " + JSON.stringify(serializeError(err)));
        }
    }

    public get = async (): Promise<AppSettings> => {
        const srvConfigBaseSql = `
            SELECT   config_id
                    ,config_name
            FROM oh_srv_config_base 
            WHERE config_name = '${this.metadata.configName}'`;

        const srvConfigEnvironmentSql = `
            SELECT   e.config_id
                    ,e.environment_key
                    ,e.environment_value
                    ,e.environment_datatype
            FROM oh_srv_config_environment e
                INNER JOIN oh_srv_config_base b
                    on e.config_id = b.config_id
            WHERE b.config_name = '${this.metadata.configName}'`;

        const srvConfigWorkersSql = `
            SELECT   w.config_id
                    ,w.worker_name
                    ,w.worker_type
                    ,w.worker_package
                    ,w.worker_version
                    ,w.worker_import_path
                    ,w.worker_is_default
                    ,w.worker_is_enabled
                    ,w.worker_metadata
            FROM oh_srv_config_workers w
                INNER JOIN oh_srv_config_base b
                    on w.config_id = b.config_id
            WHERE b.config_name = '${this.metadata.configName}'`;

        const results = await AwaitHelper.execute(
            Promise.all([
                this.executeQuery(srvConfigBaseSql),
                this.executeQuery(srvConfigEnvironmentSql),
                this.executeQuery(srvConfigWorkersSql),
            ])
        );

        const appSettings: AppSettings = new AppSettings();

        this.configId = +results[0][0][0].config_id;

        results[1][0].forEach((row) => {
            switch (row.environment_datatype) {
                case "number":
                    appSettings.environmentVariables.push({
                        key: row.environment_key,
                        value: Number(row.environment_value),
                        type: EnvironmentVariableType.Number,
                        isSystem: false,
                    });
                    break;
                case "boolean":
                    appSettings.environmentVariables.push({
                        key: row.environment_key,
                        value: row.environment_value === "true",
                        type: EnvironmentVariableType.Boolean,
                        isSystem: false,
                    });
                    break;
                default:
                    appSettings.environmentVariables.push({
                        key: row.environment_key,
                        value: String(row.environment_value),
                        type: EnvironmentVariableType.String,
                        isSystem: false,
                    });
                    break;
            }
        });

        results[2][0].forEach((row) => {
            appSettings.workers.push({
                name: row.worker_name,
                type: row.worker_type,
                package: row.worker_package,
                version: row.worker_version,
                importPath: row.worker_import_path,
                default: row.worker_is_default === "true",
                enabled: row.worker_is_enabled === "true",
                metadata: JSON.parse(row.worker_metadata),
            });
        });

        return appSettings;
    };

    public set = async (settings: AppSettings): Promise<boolean> => {
        const currentSettings: AppSettings = await this.get();

        const transaction = new sql.Transaction(this.connectionPool);

        await AwaitHelper.execute(transaction.begin());

        try {
            for (let variable of settings.environmentVariables.filter((value) => !value.isSystem)) {
                const queryBuilder = new StringBuilder();
                queryBuilder.appendLine(`BEGIN TRY`);
                queryBuilder.appendLine(
                    `INSERT oh_srv_config_environment(config_id, environment_key, environment_value, environment_datatype)`
                );

                queryBuilder.appendLine(
                    `VALUES (${this.configId}, '${variable.key}', '${String(variable.value)}', '${variable.type}')`
                );

                queryBuilder.appendLine(`END TRY`);
                queryBuilder.appendLine(`BEGIN CATCH`);

                queryBuilder.appendLine(`UPDATE oh_srv_config_environment SET`);
                queryBuilder.appendLine(`environment_value = '${String(variable.value)}',`);
                queryBuilder.appendLine(`environment_datatype = '${variable.type}',`);
                queryBuilder.appendLine(`WHERE config_id = ${this.configId} AND constant_key = '${variable.key}'`);

                queryBuilder.appendLine(`END CATCH`);

                await AwaitHelper.execute(new sql.Request(transaction).query(queryBuilder.outputString()));

                currentSettings.environmentVariables = currentSettings.environmentVariables.filter(
                    (ev: EnvironmentVariable) => ev.key != variable.key
                );
            }

            for (let worker of settings.workers) {
                const upsertWorkersSql = `
                    BEGIN TRY
                    INSERT INTO oh_srv_config_workers(
                        config_id, 
                        worker_name, 
                        worker_type, 
                        worker_package, 
                        worker_version, 
                        worker_import_path, 
                        worker_is_default, 
                        worker_is_enabled, 
                        worker_metadata)
                    VALUES (
                        ${this.configId}, 
                        '${worker.name}', 
                        '${worker.type}', 
                        '${worker.package}', 
                        '${worker.version}', 
                        '${worker.importPath}', 
                        '${worker.default ? "true" : "false"}', 
                        '${worker.enabled ? "true" : "false"}', 
                        '${JSON.stringify(worker.metadata)}')
                    END TRY
                    BEGIN CATCH
                    UPDATE oh_srv_config_workers
                    SET worker_type = '${worker.type}',
                    worker_package = '${worker.package}',
                    worker_version = '${worker.version}',
                    worker_import_path = '${worker.importPath}',
                    worker_is_default = '${worker.default ? "true" : "false"}',
                    worker_is_enabled = '${worker.enabled ? "true" : "false"}',
                    worker_metadata = '${JSON.stringify(worker.metadata)}'
                    WHERE config_id = ${this.configId}
                    AND worker_name = '${worker.name}'
                    END CATCH
                `;

                await AwaitHelper.execute(new sql.Request(transaction).query(upsertWorkersSql));

                const filteredWorkers = currentSettings.workers.filter((hw: HiveWorker) => hw.name !== worker.name);
                currentSettings.workers = filteredWorkers;
            }

            for (let variable of currentSettings.environmentVariables.filter((value) => !value.isSystem)) {
                const deleteConstantsQuery: string = `DELETE oh_srv_config_environment where config_id = ${this.configId} AND environment_key = '${variable.key}'`;
                await AwaitHelper.execute(new sql.Request(transaction).query(deleteConstantsQuery));
            }

            for (let worker of currentSettings.workers) {
                const deleteWorkerQuery: string = `DELETE oh_srv_config_workers where config_id = ${this.configId} AND worker_name = '${worker.name}'`;
                await AwaitHelper.execute(new sql.Request(transaction).query(deleteWorkerQuery));
            }

            await AwaitHelper.execute(transaction.commit());
        } catch (err) {
            await AwaitHelper.execute(transaction.rollback());
            throw new Error("MSSQL Config Save Error => " + JSON.stringify(serializeError(err)));
        }

        return true;
    };

    private executeQuery = async (query: string): Promise<any[][]> => {
        const poolRequest = this.connectionPool.request();
        const result = await AwaitHelper.execute(poolRequest.query(query));
        return result.recordsets;
    };
}
