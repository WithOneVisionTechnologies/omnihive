/// <reference path="../../types/globals.omnihive.d.ts" />

import { EnvironmentVariableType } from "@withonevision/omnihive-core/enums/EnvironmentVariableType";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { StringBuilder } from "@withonevision/omnihive-core/helpers/StringBuilder";
import { IConfigWorker } from "@withonevision/omnihive-core/interfaces/IConfigWorker";
import { EnvironmentVariable } from "@withonevision/omnihive-core/models/EnvironmentVariable";
import { HiveWorker } from "@withonevision/omnihive-core/models/HiveWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import { HiveWorkerMetadataConfigDatabase } from "@withonevision/omnihive-core/models/HiveWorkerMetadataConfigDatabase";
import fse from "fs-extra";
import knex, { Knex } from "knex";
import { serializeError } from "serialize-error";
import sqlite from "sqlite3";
import { AppSettings } from "@withonevision/omnihive-core/models/AppSettings";

export class SqliteWorkerMetadata extends HiveWorkerMetadataConfigDatabase {
    public filename: string = "";
}

export default class SqliteConfigWorker extends HiveWorkerBase implements IConfigWorker {
    public connection!: Knex;
    private metadata!: SqliteWorkerMetadata;

    private configId: number = 0;

    constructor() {
        super();
    }

    public async init(config: HiveWorker): Promise<void> {
        const sqliteMetadata: SqliteWorkerMetadata = config.metadata as SqliteWorkerMetadata;

        sqliteMetadata.password = "";
        sqliteMetadata.requireSsl = false;
        sqliteMetadata.serverAddress = "";
        sqliteMetadata.serverPort = 9999;
        sqliteMetadata.sslCertPath = "";
        sqliteMetadata.userName = "";

        try {
            await AwaitHelper.execute(super.init(config));
            this.metadata = this.checkObjectStructure<SqliteWorkerMetadata>(SqliteWorkerMetadata, sqliteMetadata);

            const filePath = global.omnihive.getFilePath(this.metadata.filename);

            if (!fse.existsSync(filePath)) {
                throw new Error("SQLite database cannot be found");
            }

            const connectionOptions: Knex.Config = {
                client: "sqlite3",
                useNullAsDefault: true,
                connection: {
                    filename: this.metadata.filename,
                },
            };
            this.connection = knex(connectionOptions);
        } catch (err) {
            throw new Error("Sqlite Init Error => " + JSON.stringify(serializeError(err)));
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

        const database = new sqlite.Database(this.metadata.filename);
        database.serialize(() => {
            database.run("BEGIN");

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

                    database.run(queryBuilder.outputString());

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

                    database.run(upsertWorkersSql);

                    const filteredWorkers = currentSettings.workers.filter((hw: HiveWorker) => hw.name !== worker.name);
                    currentSettings.workers = filteredWorkers;
                }

                for (let variable of currentSettings.environmentVariables.filter((value) => !value.isSystem)) {
                    const deleteConstantsQuery: string = `DELETE oh_srv_config_environment where config_id = ${this.configId} AND environment_key = '${variable.key}';`;
                    database.run(deleteConstantsQuery);
                }

                for (let worker of currentSettings.workers) {
                    const deleteWorkerQuery: string = `DELETE oh_srv_config_workers where config_id = ${this.configId} AND worker_name = '${worker.name}';`;
                    database.run(deleteWorkerQuery);
                }

                database.run("COMMIT");
            } catch (err) {
                database.run("ROLLBACK");
                throw new Error("SQLite Config Save Error => " + JSON.stringify(serializeError(err)));
            } finally {
                database.close;
            }
        });

        return true;
    };

    public executeQuery = async (query: string): Promise<any[][]> => {
        const result: any = await AwaitHelper.execute(this.connection.raw(query));

        const returnResults: any[][] = [];
        returnResults[0] = result;

        return returnResults;
    };
}
