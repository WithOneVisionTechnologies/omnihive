import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IConfigWorker } from "@withonevision/omnihive-core/interfaces/IConfigWorker";
import { HiveWorkerConfig } from "@withonevision/omnihive-core/models/HiveWorkerConfig";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import fse from "fs-extra";
import { serializeError } from "serialize-error";
import knex, { Knex } from "knex";
import mysql from "mysql2";
import { Pool } from "mysql2/promise";
import { HiveWorkerMetadataConfigDatabase } from "@withonevision/omnihive-core/models/HiveWorkerMetadataConfigDatabase";
import { EnvironmentVariableType } from "@withonevision/omnihive-core/enums/EnvironmentVariableType";
import { EnvironmentVariable } from "@withonevision/omnihive-core/models/EnvironmentVariable";
import { StringBuilder } from "@withonevision/omnihive-core/helpers/StringBuilder";
import { ServerConfig } from "@withonevision/omnihive-core/models/ServerConfig";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";

export default class MySqlConfigWorker extends HiveWorkerBase implements IConfigWorker {
    public connection!: Knex;
    private connectionPool!: Pool;
    private sqlConfig!: any;
    private typedMetadata!: HiveWorkerMetadataConfigDatabase;

    private configId: number = 0;

    constructor() {
        super();
    }

    public async init(name: string, metadata?: any): Promise<void> {
        try {
            await AwaitHelper.execute(super.init(name, metadata));
            this.typedMetadata = this.checkObjectStructure<HiveWorkerMetadataConfigDatabase>(
                HiveWorkerMetadataConfigDatabase,
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
                    connectionLimit: 10,
                    multipleStatements: true,
                })
                .promise();

            const connectionOptions: Knex.Config = {
                connection: {},
                pool: { min: 0, max: 10 },
            };
            connectionOptions.client = "mysql2";
            connectionOptions.connection = this.sqlConfig;
            this.connection = knex(connectionOptions);
        } catch (err) {
            throw new Error("MySQL Init Error => " + JSON.stringify(serializeError(err)));
        }
    }

    public get = async (): Promise<ServerConfig> => {
        const srvConfigBaseSql = `
            SELECT   config_id
                    ,config_name
            FROM oh_srv_config_base 
            WHERE config_name = '${this.typedMetadata.configName}'`;

        const srvConfigEnvironmentSql = `
            SELECT   e.config_id
                    ,e.environment_key
                    ,e.environment_value
                    ,e.environment_datatype
            FROM oh_srv_config_environment e
                INNER JOIN oh_srv_config_base b
                    on e.config_id = b.config_id
            WHERE b.config_name = '${this.typedMetadata.configName}'`;

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
            WHERE b.config_name = '${this.typedMetadata.configName}'`;

        const results = await AwaitHelper.execute(
            Promise.all([
                this.executeQuery(srvConfigBaseSql),
                this.executeQuery(srvConfigEnvironmentSql),
                this.executeQuery(srvConfigWorkersSql),
            ])
        );

        const serverConfig: ServerConfig = new ServerConfig();

        this.configId = +results[0][0][0].config_id;

        results[1][0].forEach((row) => {
            switch (row.environment_datatype) {
                case "number":
                    serverConfig.environmentVariables.push({
                        key: row.environment_key,
                        value: Number(row.environment_value),
                        type: EnvironmentVariableType.Number,
                        isSystem: false,
                    });
                    break;
                case "boolean":
                    serverConfig.environmentVariables.push({
                        key: row.environment_key,
                        value: row.environment_value === "true",
                        type: EnvironmentVariableType.Boolean,
                        isSystem: false,
                    });
                    break;
                default:
                    serverConfig.environmentVariables.push({
                        key: row.environment_key,
                        value: String(row.environment_value),
                        type: EnvironmentVariableType.String,
                        isSystem: false,
                    });
                    break;
            }
        });

        results[2][0].forEach((row) => {
            serverConfig.workers.push({
                name: row.worker_name,
                type: row.worker_type,
                package: row.worker_package,
                version: row.worker_version,
                importPath: row.worker_import_path,
                default: row.worker_is_default === 1,
                enabled: row.worker_is_enabled === 1,
                metadata: row.worker_metadata,
            });
        });

        return serverConfig;
    };

    public set = async (settings: ServerConfig): Promise<boolean> => {
        const currentSettings: ServerConfig = await this.get();

        const connection = await AwaitHelper.execute(this.connectionPool.getConnection());

        await AwaitHelper.execute(connection.beginTransaction());

        try {
            for (let variable of settings.environmentVariables.filter((value) => !value.isSystem)) {
                const queryBuilder = new StringBuilder();
                queryBuilder.appendLine(
                    `INSERT oh_srv_config_environment(config_id, environment_key, environment_value, environment_datatype)`
                );

                queryBuilder.appendLine(
                    `VALUES (${this.configId}, '${variable.key}', '${String(variable.value)}', '${variable.type}')`
                );

                queryBuilder.appendLine(
                    `ON DUPLICATE KEY UPDATE 
                        envrionment_value = VALUES(envrionment_value),
                        environment_datatype = VALUES(environment_datatype);`
                );

                await AwaitHelper.execute(connection.query(queryBuilder.outputString()));

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
                        '${worker.default ? 1 : 0}', 
                        '${worker.enabled ? 1 : 0}', 
                        '${JSON.stringify(worker.metadata)}')
                    ON DUPLICATE KEY UPDATE 
                        worker_type = VALUES(worker_type), 
                        worker_package = VALUES(worker_package), 
                        worker_version = VALUES(worker_version), 
                        worker_import_path = VALUES(worker_import_path), 
                        worker_is_default = VALUES(worker_is_default), 
                        worker_is_enabled = VALUES(worker_is_enabled), 
                        worker_metadata = VALUES(worker_metadata);
                `;

                await AwaitHelper.execute(connection.query(upsertWorkersSql));

                const filteredWorkers = currentSettings.workers.filter(
                    (hw: HiveWorkerConfig) => hw.name !== worker.name
                );
                currentSettings.workers = filteredWorkers;
            }

            for (let variable of currentSettings.environmentVariables.filter((value) => !value.isSystem)) {
                const deleteConstantsQuery: string = `DELETE oh_srv_config_environment where config_id = ${this.configId} AND environment_key = '${variable.key}';`;
                await AwaitHelper.execute(connection.query(deleteConstantsQuery));
            }

            for (let worker of currentSettings.workers) {
                const deleteWorkerQuery: string = `DELETE oh_srv_config_workers where config_id = ${this.configId} AND worker_name = '${worker.name}';`;
                await AwaitHelper.execute(connection.query(deleteWorkerQuery));
            }

            await AwaitHelper.execute(connection.commit());
        } catch (err) {
            if (!IsHelper.isNullOrUndefined(connection)) {
                await AwaitHelper.execute(connection.rollback());
            }
            throw new Error("MySQL Config Save Error => " + JSON.stringify(serializeError(err)));
        } finally {
            connection.release();
        }

        return true;
    };

    public executeQuery = async (query: string): Promise<any[][]> => {
        const result: any = await AwaitHelper.execute(this.connectionPool.query(query));

        const returnResults: any[][] = [];
        let currentResultIndex: number = 0;

        if (!IsHelper.isArray(result[0][0])) {
            returnResults[currentResultIndex] = result[0];
            return returnResults;
        }

        for (let r of result[0]) {
            returnResults[currentResultIndex] = r;
            currentResultIndex++;
        }

        return returnResults;
    };
}
