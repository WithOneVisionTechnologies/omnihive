/// <reference path="../../../types/globals.omnihive.d.ts" />

import { EnvironmentVariableType } from "@withonevision/omnihive-core/enums/EnvironmentVariableType";
import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { OmniHiveLogLevel } from "@withonevision/omnihive-core/enums/OmniHiveLogLevel";
import { RegisteredHiveWorkerSection } from "@withonevision/omnihive-core/enums/RegisteredHiveWorkerSection";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";
import { StringBuilder } from "@withonevision/omnihive-core/helpers/StringBuilder";
import { IConfigWorker } from "@withonevision/omnihive-core/interfaces/IConfigWorker";
import { ILogWorker } from "@withonevision/omnihive-core/interfaces/ILogWorker";
import { ServerConfig } from "@withonevision/omnihive-core/models/ServerConfig";
import { EnvironmentVariable } from "@withonevision/omnihive-core/models/EnvironmentVariable";
import { HiveWorkerConfig } from "@withonevision/omnihive-core/models/HiveWorkerConfig";
import { RegisteredHiveWorker } from "@withonevision/omnihive-core/models/RegisteredHiveWorker";
import childProcess from "child_process";
import readPkgUp, { NormalizedReadResult } from "read-pkg-up";
import { ConfigType } from "../enums/ConfigType";
import { CommandLineArgs } from "../models/CommandLineArgs";
import { GlobalObject } from "../models/GlobalObject";

export class CommonService {
    public bootLoader = async (rootDir: string, commandLineArgs: CommandLineArgs) => {
        global.omnihive = new GlobalObject();
        global.omnihive.ohDirName = rootDir;
        global.omnihive.commandLineArgs = commandLineArgs;
        global.omnihive.serverConfig = new ServerConfig();

        Object.keys(process.env)
            .filter((key: string) => key.startsWith("OH_"))
            .forEach((key: string) => {
                if (!IsHelper.isNullOrUndefined(process.env[key]) && IsHelper.isBoolean(process.env[key])) {
                    global.omnihive.serverConfig.environmentVariables.push({
                        key,
                        value: process.env[key] === "true",
                        type: EnvironmentVariableType.Boolean,
                        isSystem: true,
                    });
                    return;
                }

                if (!IsHelper.isNullOrUndefined(process.env[key]) && IsHelper.isNumber(process.env[key])) {
                    global.omnihive.serverConfig.environmentVariables.push({
                        key,
                        value: Number(process.env[key]),
                        type: EnvironmentVariableType.Number,
                        isSystem: true,
                    });
                    return;
                }

                global.omnihive.serverConfig.environmentVariables.push({
                    key,
                    value: String(process.env[key]),
                    type: EnvironmentVariableType.String,
                    isSystem: true,
                });
            });

        const pkgJson: NormalizedReadResult | undefined = await AwaitHelper.execute(readPkgUp());

        // Load Config Worker
        if (
            !IsHelper.isNullOrUndefined(pkgJson) &&
            !IsHelper.isNullOrUndefined(pkgJson.packageJson) &&
            !IsHelper.isNullOrUndefined(pkgJson.packageJson.omniHive) &&
            !IsHelper.isNullOrUndefined(pkgJson.packageJson.omniHive.configWorkers)
        ) {
            const configWorkers: HiveWorkerConfig[] = pkgJson.packageJson.omniHive.configWorkers as HiveWorkerConfig[];
            let selectedConfigWorkerName: string;

            switch (process.env["OH_CONFIG_TYPE"] as ConfigType) {
                case ConfigType.JSON:
                    selectedConfigWorkerName = "__ohConfigJsonWorker";
                    break;
                case ConfigType.MSSQL:
                    selectedConfigWorkerName = "__ohConfigMssqlWorker";
                    break;
                case ConfigType.MySQL:
                    selectedConfigWorkerName = "__ohConfigMysqlWorker";
                    break;
                case ConfigType.Postgres:
                    selectedConfigWorkerName = "__ohConfigPostgresWorker";
                    break;
                case ConfigType.SQLite:
                    selectedConfigWorkerName = "__ohConfigSqliteWorker";
                    break;
                case ConfigType.YAML:
                    selectedConfigWorkerName = "__ohConfigYamlWorker";
                    break;
                default:
                    selectedConfigWorkerName = "__ohConfigJsonWorker";
                    break;
            }

            const selectedConfigWorker: HiveWorkerConfig | undefined = configWorkers.find(
                (worker: HiveWorkerConfig) => worker.name === selectedConfigWorkerName
            );

            if (IsHelper.isNullOrUndefined(selectedConfigWorker)) {
                throw new Error(`Select config worker ${selectedConfigWorkerName} could not be found or loaded...`);
            }

            if (
                !global.omnihive.registeredWorkers.some(
                    (rw: RegisteredHiveWorker) => rw.name === selectedConfigWorker.name
                )
            ) {
                await AwaitHelper.execute(
                    global.omnihive.pushWorker(selectedConfigWorker, RegisteredHiveWorkerSection.Config)
                );
                global.omnihive.serverConfig.workers.push(selectedConfigWorker);
            }
        }

        // Load environment variables
        const configWorker: IConfigWorker | undefined = global.omnihive.getWorker<IConfigWorker>(HiveWorkerType.Config);

        if (IsHelper.isNullOrUndefined(configWorker)) {
            throw new Error("No config worker can be found.  OmniHive cannot load.");
        }

        const serverConfig: ServerConfig = await AwaitHelper.execute(configWorker.get());

        // Push config environment variables
        serverConfig.environmentVariables.forEach((envVariable: EnvironmentVariable) => {
            if (
                !global.omnihive.serverConfig.environmentVariables.some(
                    (ev: EnvironmentVariable) => ev.key === envVariable.key
                )
            ) {
                const valueToPush: EnvironmentVariable = {
                    key: envVariable.key,
                    type: envVariable.type,
                    isSystem: false,
                    value: undefined,
                };

                switch (envVariable.type) {
                    case EnvironmentVariableType.Boolean:
                        valueToPush.value = envVariable.value;
                        break;
                    case EnvironmentVariableType.Number:
                        valueToPush.value = Number(envVariable.value);
                        break;
                    case EnvironmentVariableType.String:
                        valueToPush.value = String(envVariable.value);
                        break;
                    default:
                        valueToPush.value = String(envVariable.value);
                        break;
                }

                global.omnihive.serverConfig.environmentVariables.push(valueToPush);
            }
        });

        // Load Boot Workers
        if (
            !IsHelper.isNullOrUndefined(pkgJson) &&
            !IsHelper.isNullOrUndefined(pkgJson.packageJson) &&
            !IsHelper.isNullOrUndefined(pkgJson.packageJson.omniHive) &&
            !IsHelper.isNullOrUndefined(pkgJson.packageJson.omniHive.bootWorkers)
        ) {
            const bootWorkers: HiveWorkerConfig[] = pkgJson.packageJson.omniHive.bootWorkers as HiveWorkerConfig[];

            for (const bootWorker of bootWorkers) {
                if (
                    !global.omnihive.registeredWorkers.some((rw: RegisteredHiveWorker) => rw.name === bootWorker.name)
                ) {
                    await AwaitHelper.execute(global.omnihive.pushWorker(bootWorker, RegisteredHiveWorkerSection.Boot));
                    global.omnihive.serverConfig.workers.push(bootWorker);
                }
            }
        }
    };

    public workerLoader = async () => {
        const configWorker: IConfigWorker | undefined = global.omnihive.getWorker<IConfigWorker>(HiveWorkerType.Config);

        if (IsHelper.isNullOrUndefined(configWorker)) {
            throw new Error("No config worker can be found.  OmniHive cannot load.");
        }

        const logWorker: ILogWorker | undefined = global.omnihive.getWorker<ILogWorker>(
            HiveWorkerType.Log,
            "__ohBootLogWorker"
        );

        const pkgJson: NormalizedReadResult | undefined = await AwaitHelper.execute(readPkgUp());
        const serverConfig: ServerConfig = await AwaitHelper.execute(configWorker.get());

        // Load Core Workers
        logWorker?.write(OmniHiveLogLevel.Info, `Loading core workers from package.json...`);

        if (
            !IsHelper.isNullOrUndefined(pkgJson) &&
            !IsHelper.isNullOrUndefined(pkgJson.packageJson) &&
            !IsHelper.isNullOrUndefined(pkgJson.packageJson.omniHive) &&
            !IsHelper.isNullOrUndefined(pkgJson.packageJson.omniHive.coreWorkers)
        ) {
            const coreWorkers: HiveWorkerConfig[] = pkgJson.packageJson.omniHive.coreWorkers as HiveWorkerConfig[];

            for (const coreWorker of coreWorkers) {
                if (
                    !global.omnihive.registeredWorkers.some((rw: RegisteredHiveWorker) => rw.name === coreWorker.name)
                ) {
                    await AwaitHelper.execute(global.omnihive.pushWorker(coreWorker, RegisteredHiveWorkerSection.Core));
                    global.omnihive.serverConfig.workers.push(coreWorker);
                }
            }
        }

        // Load user workers
        logWorker?.write(OmniHiveLogLevel.Info, `Loading user workers from enviroment configuration...`);

        for (const worker of serverConfig.workers) {
            if (!global.omnihive.registeredWorkers.some((rw: RegisteredHiveWorker) => rw.name === worker.name)) {
                global.omnihive.serverConfig.workers.push(worker);
            }
        }

        // Load Default Workers
        logWorker?.write(OmniHiveLogLevel.Info, `Registering default workers from package.json...`);
        if (
            !IsHelper.isNullOrUndefined(pkgJson) &&
            !IsHelper.isNullOrUndefined(pkgJson.packageJson) &&
            !IsHelper.isNullOrUndefined(pkgJson.packageJson.omniHive) &&
            !IsHelper.isNullOrUndefined(pkgJson.packageJson.omniHive.defaultWorkers)
        ) {
            const defaultWorkers: HiveWorkerConfig[] = pkgJson.packageJson.omniHive
                .defaultWorkers as HiveWorkerConfig[];

            defaultWorkers.forEach((defaultWorker: HiveWorkerConfig) => {
                if (
                    !global.omnihive.serverConfig.workers.some(
                        (hiveWorker: HiveWorkerConfig) => hiveWorker.type === defaultWorker.type
                    )
                ) {
                    global.omnihive.serverConfig.workers.push(defaultWorker);
                }
            });
        }

        logWorker?.write(OmniHiveLogLevel.Info, `Working on hive worker packages...`);

        if (
            !IsHelper.isNullOrUndefined(pkgJson) &&
            !IsHelper.isNullOrUndefined(pkgJson.packageJson) &&
            !IsHelper.isNullOrUndefined(pkgJson.packageJson.dependencies) &&
            !IsHelper.isNullOrUndefined(pkgJson.packageJson.omniHive) &&
            !IsHelper.isNullOrUndefined(pkgJson.packageJson.omniHive.coreDependencies)
        ) {
            // Build lists
            const corePackages: any = pkgJson.packageJson.omniHive.coreDependencies;
            const loadedPackages: any = pkgJson.packageJson.dependencies;
            const workerPackages: any = {};

            global.omnihive.serverConfig.workers.forEach((hiveWorker: HiveWorkerConfig) => {
                if (
                    !IsHelper.isNullOrUndefined(hiveWorker.package) &&
                    !IsHelper.isEmptyStringOrWhitespace(hiveWorker.package) &&
                    !IsHelper.isNullOrUndefined(hiveWorker.version) &&
                    !IsHelper.isEmptyStringOrWhitespace(hiveWorker.version)
                ) {
                    workerPackages[hiveWorker.package] = hiveWorker.version;
                }
            });

            //Find out what to remove
            const packagesToRemove: string[] = [];

            for (const loadedPackage of Object.entries(loadedPackages)) {
                let removeLoadedPackage: boolean = true;

                for (const corePackage of Object.entries(corePackages)) {
                    if (corePackage[0] === loadedPackage[0] && corePackage[1] === loadedPackage[1]) {
                        removeLoadedPackage = false;
                        break;
                    }
                }

                if (removeLoadedPackage) {
                    for (const workerPackage of Object.entries(workerPackages)) {
                        if (workerPackage[0] === loadedPackage[0] && workerPackage[1] === loadedPackage[1]) {
                            removeLoadedPackage = false;
                            break;
                        }
                    }
                }

                if (removeLoadedPackage) {
                    packagesToRemove.push(loadedPackage[0]);
                }
            }

            if (IsHelper.isEmptyArray(packagesToRemove)) {
                logWorker?.write(OmniHiveLogLevel.Info, `No Custom Packages to Uninstall...Moving On`);
            } else {
                logWorker?.write(OmniHiveLogLevel.Info, `Removing ${packagesToRemove.length} Custom Package(s)`);
                const removeCommand = new StringBuilder();
                removeCommand.append("yarn remove ");

                packagesToRemove.forEach((packageName: string, index: number) => {
                    logWorker?.write(OmniHiveLogLevel.Info, `Removing ${packageName} As a Custom Package(s)`);
                    removeCommand.append(packageName);

                    if (index < packagesToRemove.length - 1) {
                        removeCommand.append(" ");
                    }
                });

                const removeSpawn = childProcess.spawnSync(removeCommand.outputString(), {
                    shell: true,
                    cwd: global.omnihive.ohDirName,
                    stdio: ["inherit", "pipe", "pipe"],
                });

                if (removeSpawn.status !== 0) {
                    const removeError: Error = new Error(removeSpawn.stderr.toString().trim());
                    logWorker?.write(OmniHiveLogLevel.Error, removeSpawn.stderr.toString().trim());
                    throw removeError;
                }
            }

            //Find out what to add
            const packagesToAdd: string[] = [];

            for (const workerPackage of Object.entries(workerPackages)) {
                let addWorkerPackage: boolean = true;

                for (const loadedPackage of Object.entries(loadedPackages)) {
                    if (workerPackage[0] === loadedPackage[0] && workerPackage[1] === loadedPackage[1]) {
                        addWorkerPackage = false;
                        break;
                    }
                }

                if (addWorkerPackage) {
                    packagesToAdd.push(`${workerPackage[0]}@${workerPackage[1]}`);
                }
            }

            if (IsHelper.isEmptyArray(packagesToAdd)) {
                logWorker?.write(OmniHiveLogLevel.Info, `No Custom Packages to Add...Moving On`);
            } else {
                logWorker?.write(OmniHiveLogLevel.Info, `Adding ${packagesToAdd.length} Custom Package(s)`);
                const addCommand = new StringBuilder();
                addCommand.append("yarn add ");

                packagesToAdd.forEach((packageName: string, index: number) => {
                    logWorker?.write(OmniHiveLogLevel.Info, `Adding ${packageName} As a Custom Package(s)`);
                    addCommand.append(packageName);

                    if (index < packagesToAdd.length - 1) {
                        addCommand.append(" ");
                    }
                });

                const addSpawn = childProcess.spawnSync(addCommand.outputString(), {
                    shell: true,
                    cwd: global.omnihive.ohDirName,
                    stdio: ["inherit", "pipe", "pipe"],
                });

                if (addSpawn.status !== 0) {
                    const addError: Error = new Error(addSpawn.stderr.toString().trim());
                    logWorker?.write(OmniHiveLogLevel.Error, addSpawn.stderr.toString().trim());
                    throw addError;
                }
            }
        }

        logWorker?.write(OmniHiveLogLevel.Info, "Custom packages complete");

        // Register hive workers
        logWorker?.write(OmniHiveLogLevel.Info, "Working on hive workers...");
        await AwaitHelper.execute(global.omnihive.initWorkers());
        logWorker?.write(OmniHiveLogLevel.Info, "Hive Workers Initiated...");
    };
}
