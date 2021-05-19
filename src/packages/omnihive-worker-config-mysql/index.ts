import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IConfigWorker } from "@withonevision/omnihive-core/interfaces/IConfigWorker";
import { HiveWorker } from "@withonevision/omnihive-core/models/HiveWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import { ServerSettings } from "@withonevision/omnihive-core/models/ServerSettings";
import fse from "fs-extra";
import { serializeError } from "serialize-error";
import { StringHelper } from "@withonevision/omnihive-core/helpers/StringHelper";
import knex, { Knex } from "knex";
import mysql from "mysql2";
import { Pool } from "mysql2/promise";
import { HiveWorkerMetadataConfigDatabase } from "@withonevision/omnihive-core/models/HiveWorkerMetadataConfigDatabase";

export default class MySqlConfigWorker extends HiveWorkerBase implements IConfigWorker {
    public connection!: Knex;
    private connectionPool!: Pool;
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
                host: this.metadata.serverAddress,
                port: this.metadata.serverPort,
                database: this.metadata.databaseName,
                user: this.metadata.userName,
                password: this.metadata.password,
            };

            if (this.metadata.requireSsl) {
                if (StringHelper.isNullOrWhiteSpace(this.metadata.sslCertPath)) {
                    this.sqlConfig.ssl = this.metadata.requireSsl;
                } else {
                    this.sqlConfig.ssl = {
                        ca: fse.readFileSync(this.metadata.sslCertPath).toString(),
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

    public get = async (): Promise<ServerSettings> => {
        const srvConfigBaseSql = `
            SELECT   config_id
                    ,cluster_id
                    ,config_name
            FROM oh_srv_config_base 
            WHERE config_name = '${this.metadata.configName}'`;

        const srvConfigConstantsSql = `
            SELECT   c.config_id
                    ,c.constant_key
                    ,c.constant_value
                    ,c.constant_datatype
            FROM oh_srv_config_constants c
                INNER JOIN oh_srv_config_base b
                    on c.config_id = b.config_id
            WHERE b.config_name = '${this.metadata.configName}'`;

        const srvConfigFeaturesSql = `
            SELECT   f.config_id
                    ,f.feature_key
                    ,f.feature_value
            FROM oh_srv_config_features f
                INNER JOIN oh_srv_config_base b
                    on f.config_id = b.config_id
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
                this.executeQuery(srvConfigConstantsSql),
                this.executeQuery(srvConfigFeaturesSql),
                this.executeQuery(srvConfigWorkersSql),
            ])
        );

        const serverSettings: ServerSettings = new ServerSettings();

        this.configId = +results[0][0][0].config_id;

        results[1][0].forEach((row) => {
            switch (row.constant_datatype) {
                case "number":
                    serverSettings.constants[row.constant_key] = Number(row.constant_value);
                    break;
                case "boolean":
                    serverSettings.constants[row.constant_key] = row.constant_value === 1;
                    break;
                default:
                    serverSettings.constants[row.constant_key] = String(row.constant_value);
                    break;
            }
        });

        results[2][0].forEach((row) => {
            serverSettings.features[row.feature_key] = Boolean(row.feature_value);
        });

        results[3][0].forEach((row) => {
            serverSettings.workers.push({
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

        return serverSettings;
    };

    public set = async (settings: ServerSettings): Promise<boolean> => {
        const connection = await AwaitHelper.execute(this.connectionPool.getConnection());

        await AwaitHelper.execute(connection.beginTransaction());

        try {
            for (let key in settings.constants) {
                let upsertConstantsSql = `INSERT INTO oh_srv_config_constants(config_id, constant_key, constant_value, constant_datatype)`;

                switch (typeof settings.constants[key]) {
                    case "number":
                    case "bigint":
                        upsertConstantsSql = `${upsertConstantsSql} VALUES (${this.configId}, '${key}', ${settings.constants[key]}, 'number')`;
                        break;
                    case "boolean":
                        upsertConstantsSql = `${upsertConstantsSql} VALUES (${this.configId}, '${key}', ${
                            settings.constants[key] === true ? 1 : 0
                        }, 'boolean')`;
                        break;
                    default:
                        upsertConstantsSql = `${upsertConstantsSql} VALUES (${this.configId}, '${key}', '${settings.constants[key]}', 'string')`;
                        break;
                }

                upsertConstantsSql = `${upsertConstantsSql} ON DUPLICATE KEY UPDATE constant_value = VALUES(constant_value)`;

                await AwaitHelper.execute(connection.query(upsertConstantsSql));
            }

            for (let key in settings.features) {
                const upsertFeaturesSql = `
                    INSERT INTO oh_srv_config_features(config_id, feature_key, feature_value)
                    VALUES (${this.configId}, '${key}', ${settings.features[key] === true ? 1 : 0})
                    ON DUPLICATE KEY UPDATE feature_value = VALUES(feature_value);
                `;

                await AwaitHelper.execute(connection.query(upsertFeaturesSql));
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
                        '${worker.default === true ? 1 : 0}', 
                        '${worker.enabled === true ? 1 : 0}', 
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
            }

            await AwaitHelper.execute(connection.commit());
        } catch (err) {
            if (connection) {
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
}
