import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { HiveWorker } from "@withonevision/omnihive-core/models/HiveWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import knex, { Knex } from "knex";
import sql from "mssql";
import { serializeError } from "serialize-error";
import { IConfigWorker } from "@withonevision/omnihive-core/interfaces/IConfigWorker";
import { ServerSettings } from "@withonevision/omnihive-core/models/ServerSettings";
import { HiveWorkerMetadataConfigDatabase } from "@withonevision/omnihive-core/models/HiveWorkerMetadataConfigDatabase";
import { StringBuilder } from "@withonevision/omnihive-core/helpers/StringBuilder";

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
                    serverSettings.constants[row.constant_key] = row.constant_value === "true";
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
                default: row.worker_is_default,
                enabled: row.worker_is_enabled,
                metadata: JSON.parse(row.worker_metadata),
            });
        });

        return serverSettings;
    };

    public set = async (settings: ServerSettings): Promise<boolean> => {
        const transaction = new sql.Transaction(this.connectionPool);

        await AwaitHelper.execute(transaction.begin());

        try {
            for (let key in settings.constants) {
                const queryBuilder = new StringBuilder();
                queryBuilder.appendLine(`BEGIN TRY`);
                queryBuilder.append(
                    `INSERT oh_srv_config_constants(config_id, constant_key, constant_value, constant_datatype) `
                );

                switch (typeof settings.constants[key]) {
                    case "number":
                    case "bigint":
                        queryBuilder.appendLine(
                            `VALUES (${this.configId}, '${key}', ${settings.constants[key]}, 'number')`
                        );
                        break;
                    case "boolean":
                        queryBuilder.appendLine(
                            `VALUES (${this.configId}, '${key}', '${settings.constants[key]}', 'boolean')`
                        );
                        break;
                    default:
                        queryBuilder.appendLine(
                            `VALUES (${this.configId}, '${key}', '${settings.constants[key]}', 'string')`
                        );
                        break;
                }

                queryBuilder.appendLine(`END TRY`);
                queryBuilder.appendLine(`BEGIN CATCH`);

                queryBuilder.append(`UPDATE oh_srv_config_constants SET `);

                switch (typeof settings.constants[key]) {
                    case "number":
                    case "bigint":
                        queryBuilder.appendLine(`constant_value = ${settings.constants[key]}`);
                        break;
                    case "boolean":
                        queryBuilder.appendLine(`constant_value = '${settings.constants[key]}'`);
                        break;
                    default:
                        queryBuilder.appendLine(`constant_value = '${settings.constants[key]}'`);
                        break;
                }

                queryBuilder.appendLine(`WHERE config_id = ${this.configId} AND constant_key = '${key}'`);

                queryBuilder.appendLine(`END CATCH`);

                await AwaitHelper.execute(new sql.Request(transaction).query(queryBuilder.outputString()));
            }

            for (let key in settings.features) {
                const upsertFeaturesSql = `
                    BEGIN TRY
                    INSERT oh_srv_config_features(config_id, feature_key, feature_value)
                    VALUES (${this.configId}, '${key}', '${settings.features[key]}')
                    END TRY
                    BEGIN CATCH
                    UPDATE oh_srv_config_features
                    SET feature_value = '${settings.features[key]}'
                    WHERE config_id = ${this.configId}
                    AND feature_key = '${key}'
                    END CATCH
                `;

                await AwaitHelper.execute(new sql.Request(transaction).query(upsertFeaturesSql));
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
                        '${worker.default}', 
                        '${worker.enabled}', 
                        '${JSON.stringify(worker.metadata)}')
                    END TRY
                    BEGIN CATCH
                    UPDATE oh_srv_config_workers
                    SET worker_type = '${worker.type}',
                    worker_package = '${worker.package}',
                    worker_version = '${worker.version}',
                    worker_import_path = '${worker.importPath}',
                    worker_is_default = '${worker.default}',
                    worker_is_enabled = '${worker.enabled}',
                    worker_metadata = '${JSON.stringify(worker.metadata)}'
                    WHERE config_id = ${this.configId}
                    AND worker_name = '${worker.name}'
                    END CATCH
                `;

                await AwaitHelper.execute(new sql.Request(transaction).query(upsertWorkersSql));
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
