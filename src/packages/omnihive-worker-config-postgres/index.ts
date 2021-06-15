import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IConfigWorker } from "@withonevision/omnihive-core/interfaces/IConfigWorker";
import { HiveWorker } from "@withonevision/omnihive-core/models/HiveWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import fse from "fs-extra";
import { serializeError } from "serialize-error";
import knex, { Knex } from "knex";
import pg from "pg";
import { HiveWorkerMetadataConfigDatabase } from "@withonevision/omnihive-core/models/HiveWorkerMetadataConfigDatabase";
import { EnvironmentVariableType } from "@withonevision/omnihive-core/enums/EnvironmentVariableType";
import { EnvironmentVariable } from "@withonevision/omnihive-core/models/EnvironmentVariable";
import { StringBuilder } from "@withonevision/omnihive-core/helpers/StringBuilder";
import { AppSettings } from "@withonevision/omnihive-core/models/AppSettings";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";

export default class PostgresConfigWorker extends HiveWorkerBase implements IConfigWorker {
    public connection!: Knex;
    private connectionPool!: pg.Pool;
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

            if (IsHelper.isEmptyStringOrWhitespace(this.metadata.configName)) {
                throw new Error("No config name set to retrieve");
            }

            this.sqlConfig = {
                host: this.metadata.serverAddress,
                port: this.metadata.serverPort,
                database: this.metadata.databaseName,
                user: this.metadata.userName,
                password: this.metadata.password,
            };

            if (this.metadata.requireSsl) {
                if (IsHelper.isEmptyStringOrWhitespace(this.metadata.sslCertPath)) {
                    this.sqlConfig.ssl = this.metadata.requireSsl;
                } else {
                    this.sqlConfig.ssl = {
                        ca: fse.readFileSync(this.metadata.sslCertPath).toString(),
                    };
                }
            }

            this.connectionPool = new pg.Pool({ ...this.sqlConfig });
            this.connectionPool.connect();

            const connectionOptions: Knex.Config = {
                connection: {},
                pool: { min: 0, max: 10 },
            };
            connectionOptions.client = "pg";
            connectionOptions.connection = this.sqlConfig;
            this.connection = knex(connectionOptions);
        } catch (err) {
            throw new Error("Postgres Init Error => " + JSON.stringify(serializeError(err)));
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
                default: row.worker_is_default,
                enabled: row.worker_is_enabled,
                metadata: row.worker_metadata,
            });
        });

        return appSettings;
    };

    public set = async (settings: AppSettings): Promise<boolean> => {
        const currentSettings: AppSettings = await this.get();

        const client = await AwaitHelper.execute(this.connectionPool.connect());

        await AwaitHelper.execute(client.query("BEGIN"));

        try {
            for (let variable of settings.environmentVariables.filter((value) => !value.isSystem)) {
                const queryBuilder = new StringBuilder();
                queryBuilder.appendLine(
                    `INSERT INTO oh_srv_config_environment(config_id, environment_key, environment_value, environment_datatype)`
                );

                queryBuilder.appendLine(
                    `VALUES (${this.configId}, '${variable.key}', '${String(variable.value)}', '${variable.type}')`
                );

                queryBuilder.appendLine(
                    `ON CONFLICT (config_id, environment_key) DO UPDATE SET
                        environment_value = EXCLUDED.environment_value,
                        environment_datatype = EXCLUDED.environment_datatype;`
                );

                await AwaitHelper.execute(client.query(queryBuilder.outputString()));

                currentSettings.environmentVariables = currentSettings.environmentVariables.filter(
                    (ev: EnvironmentVariable) => ev.key != variable.key
                );
            }

            for (let worker of settings.workers) {
                const upsertWorkersSql = `
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
                    ON CONFLICT (
                        config_id, 
                        worker_name) DO UPDATE 
                        SET worker_type = EXCLUDED.worker_type, 
                            worker_package = EXCLUDED.worker_package, 
                            worker_version = EXCLUDED.worker_version, 
                            worker_import_path = EXCLUDED.worker_import_path, 
                            worker_is_default = EXCLUDED.worker_is_default, 
                            worker_is_enabled = EXCLUDED.worker_is_enabled, 
                            worker_metadata = EXCLUDED.worker_metadata;
                `;

                await AwaitHelper.execute(client.query(upsertWorkersSql));

                const filteredWorkers = currentSettings.workers.filter((hw: HiveWorker) => hw.name !== worker.name);
                currentSettings.workers = filteredWorkers;
            }

            for (let variable of currentSettings.environmentVariables.filter((value) => !value.isSystem)) {
                const deleteConstantsQuery: string = `DELETE oh_srv_config_environment where config_id = ${this.configId} AND environment_key = '${variable.key}';`;
                await AwaitHelper.execute(client.query(deleteConstantsQuery));
            }

            for (let worker of currentSettings.workers) {
                const deleteWorkerQuery: string = `DELETE oh_srv_config_workers where config_id = ${this.configId} AND worker_name = '${worker.name}';`;
                await AwaitHelper.execute(client.query(deleteWorkerQuery));
            }

            await AwaitHelper.execute(client.query("COMMIT"));
        } catch (err) {
            await AwaitHelper.execute(client.query("ROLLBACK"));
            throw new Error("Postgres Config Save Error => " + JSON.stringify(serializeError(err)));
        } finally {
            client.release();
        }

        return true;
    };

    private executeQuery = async (query: string): Promise<any[][]> => {
        const result = await AwaitHelper.execute(this.connectionPool.query(query));

        const returnResults: any[][] = [];
        let currentResultIndex: number = 0;

        if (!IsHelper.isArray(result)) {
            returnResults[currentResultIndex] = result.rows;
            return returnResults;
        }

        for (let r of result) {
            returnResults[currentResultIndex] = r.rows;
            currentResultIndex++;
        }

        return returnResults;
    };
}
