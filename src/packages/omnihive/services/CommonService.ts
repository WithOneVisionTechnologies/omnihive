/// <reference path="../../../types/globals.omnihive.d.ts" />

import { OmniHiveLogLevel } from "@withonevision/omnihive-core/enums/OmniHiveLogLevel";
import { StringBuilder } from "@withonevision/omnihive-core/helpers/StringBuilder";
import { HiveWorker } from "@withonevision/omnihive-core/models/HiveWorker";
import childProcess from "child_process";
import { NormalizedReadResult } from "read-pkg-up";
import { RegisteredHiveWorker } from "@withonevision/omnihive-core/models/RegisteredHiveWorker";
import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { ILogWorker } from "@withonevision/omnihive-core/interfaces/ILogWorker";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";

export class CommonService {
    public initOmniHiveApp = async (packageJson: NormalizedReadResult | undefined) => {
        const logWorker: ILogWorker | undefined = global.omnihive.getWorker<ILogWorker>(
            HiveWorkerType.Log,
            "ohBootLogWorker"
        );

        // Cleanup Reset
        global.omnihive.registeredSchemas.splice(0, global.omnihive.registeredSchemas.length);
        global.omnihive.registeredUrls.splice(0, global.omnihive.registeredUrls.length);

        const prunedHiveWorkers: RegisteredHiveWorker[] = [];

        global.omnihive.registeredWorkers.forEach((worker: RegisteredHiveWorker) => {
            if (global.omnihive.bootWorkerNames.includes(worker.name)) {
                prunedHiveWorkers.push(worker);
            } else {
                delete require.cache[require.resolve(worker.importPath)];
            }
        });

        global.omnihive.registeredWorkers.splice(0, global.omnihive.registeredWorkers.length);
        global.omnihive.registeredWorkers = prunedHiveWorkers;

        // Load Core Workers
        if (
            packageJson &&
            packageJson.packageJson &&
            packageJson.packageJson.omniHive &&
            packageJson.packageJson.omniHive.coreWorkers
        ) {
            const coreWorkers: HiveWorker[] = packageJson.packageJson.omniHive.coreWorkers as HiveWorker[];

            for (const coreWorker of coreWorkers) {
                if (
                    !global.omnihive.registeredWorkers.some((rw: RegisteredHiveWorker) => rw.name === coreWorker.name)
                ) {
                    await AwaitHelper.execute(global.omnihive.pushWorker(coreWorker, false, true));
                    global.omnihive.serverSettings.workers.push(coreWorker);
                }
            }
        }

        // Load Workers
        logWorker?.write(OmniHiveLogLevel.Info, `Registering default workers from package.json...`);

        // Load Default Workers
        if (
            packageJson &&
            packageJson.packageJson &&
            packageJson.packageJson.omniHive &&
            packageJson.packageJson.omniHive.defaultWorkers
        ) {
            const defaultWorkers: HiveWorker[] = packageJson.packageJson.omniHive.defaultWorkers as HiveWorker[];

            defaultWorkers.forEach((defaultWorker: HiveWorker) => {
                if (
                    !global.omnihive.serverSettings.workers.some(
                        (hiveWorker: HiveWorker) => hiveWorker.type === defaultWorker.type
                    )
                ) {
                    global.omnihive.serverSettings.workers.push(defaultWorker);
                }
            });
        }

        logWorker?.write(OmniHiveLogLevel.Info, `Working on hive worker packages...`);

        if (
            packageJson &&
            packageJson.packageJson &&
            packageJson.packageJson.dependencies &&
            packageJson.packageJson.omniHive &&
            packageJson.packageJson.omniHive.coreDependencies
        ) {
            // Build lists
            const corePackages: any = packageJson.packageJson.omniHive.coreDependencies;
            const loadedPackages: any = packageJson.packageJson.dependencies;
            const workerPackages: any = {};

            global.omnihive.serverSettings.workers.forEach((hiveWorker: HiveWorker) => {
                if (
                    hiveWorker.package &&
                    hiveWorker.package !== "" &&
                    hiveWorker.version &&
                    hiveWorker.version !== ""
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

            if (packagesToRemove.length === 0) {
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

            if (packagesToAdd.length === 0) {
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
        await AwaitHelper.execute(global.omnihive.initWorkers(global.omnihive.serverSettings.workers));
        logWorker?.write(OmniHiveLogLevel.Info, "Hive Workers Initiated...");
    };
}
