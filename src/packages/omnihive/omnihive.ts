#!/usr/bin/env node
/// <reference path="../../types/globals.omnihive.d.ts" />

import { ServerStatus } from "@withonevision/omnihive-core/enums/ServerStatus";
import { HiveWorker } from "@withonevision/omnihive-core/models/HiveWorker";
import { RegisteredHiveWorker } from "@withonevision/omnihive-core/models/RegisteredHiveWorker";
import chalk from "chalk";
import figlet from "figlet";
import fse from "fs-extra";
import nodeCleanup from "node-cleanup";
import readPkgUp, { NormalizedReadResult } from "read-pkg-up";
import yargs from "yargs";
import { GlobalObject } from "./models/GlobalObject";
import { ServerService } from "./services/ServerService";
import { TaskRunnerService } from "./services/TaskRunnerService";
import dotenv from "dotenv";
import { IConfigWorker } from "@withonevision/omnihive-core/interfaces/IConfigWorker";
import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import path from "path";
import { StringHelper } from "@withonevision/omnihive-core/helpers/StringHelper";
import { AdminService } from "./services/AdminService";
import { AdminEventType } from "@withonevision/omnihive-core/enums/AdminEventType";
import { AdminRoomType } from "@withonevision/omnihive-core/enums/AdminRoomType";

const init = async () => {
    process.setMaxListeners(0);
    const args = yargs(process.argv.slice(2));

    console.log(chalk.yellow(figlet.textSync("OMNIHIVE")));
    console.log();

    args.help(false)
        .version(false)
        .strict()
        .command(["*", "server"], "Server Runner", (args) => {
            return args.option("environmentFile", {
                alias: "ef",
                type: "string",
                description: "Path to environment file (absolute and relative will be checked)",
            });
        })
        .command("taskRunner", "Command-Line Task Runner", (args) => {
            return args
                .option("environmentFile", {
                    alias: "ef",
                    type: "string",
                    description: "Path to environment file (absolute and relative will be checked)",
                })
                .option("worker", {
                    alias: "w",
                    type: "string",
                    demandOption: true,
                    description: "Registered worker to invoke",
                })
                .option("args", {
                    alias: "a",
                    type: "string",
                    demandOption: false,
                    description: "Full path to JSON args file",
                });
        });

    global.omnihive = new GlobalObject();
    global.omnihive.ohDirName = __dirname;
    global.omnihive.commandLineArgs = {
        environmentFile: (args.argv.environmentFile as string) ?? "",
        taskRunnerWorker: (args.argv.worker as string) ?? "",
        taskRunnerArgs: (args.argv.args as string) ?? "",
    };

    if (args.argv.environmentFile && fse.existsSync(args.argv.environmentFile as string)) {
        dotenv.config({ path: args.argv.environmentFile as string });
    }

    if (args.argv.environmentFile && !fse.existsSync(args.argv.environmentFile as string)) {
        if (fse.existsSync(path.join(global.omnihive.ohDirName, args.argv.environmentFile as string))) {
            dotenv.config({ path: path.join(global.omnihive.ohDirName, args.argv.environmentFile as string) });
        }
    }

    if (
        !process.env.OMNIHIVE_BOOT_LOADER_LOCATION ||
        StringHelper.isNullOrWhiteSpace(process.env.OMNIHIVE_BOOT_LOADER_LOCATION) ||
        (!fse.existsSync(process.env.OMNIHIVE_BOOT_LOADER_LOCATION) &&
            !fse.existsSync(
                path.join(
                    path.parse(global.omnihive.commandLineArgs.environmentFile).dir,
                    process.env.OMNIHIVE_BOOT_LOADER_LOCATION
                )
            ) &&
            !fse.existsSync(path.join(global.omnihive.ohDirName, process.env.OMNIHIVE_BOOT_LOADER_LOCATION)))
    ) {
        throw new Error("No Valid Boot Loader Location Given...OmniHive Cannot Continue");
    }

    try {
        if (fse.existsSync(process.env.OMNIHIVE_BOOT_LOADER_LOCATION)) {
            global.omnihive.bootLoaderSettings = JSON.parse(
                fse.readFileSync(process.env.OMNIHIVE_BOOT_LOADER_LOCATION, "utf8")
            );
        }

        if (
            fse.existsSync(
                path.join(
                    path.parse(global.omnihive.commandLineArgs.environmentFile).dir,
                    process.env.OMNIHIVE_BOOT_LOADER_LOCATION
                )
            )
        ) {
            global.omnihive.bootLoaderSettings = JSON.parse(
                fse.readFileSync(
                    path.join(
                        path.parse(global.omnihive.commandLineArgs.environmentFile).dir,
                        process.env.OMNIHIVE_BOOT_LOADER_LOCATION
                    ),
                    "utf8"
                )
            );
        }

        if (fse.existsSync(path.join(global.omnihive.ohDirName, process.env.OMNIHIVE_BOOT_LOADER_LOCATION))) {
            global.omnihive.bootLoaderSettings = JSON.parse(
                fse.readFileSync(
                    path.join(global.omnihive.ohDirName, process.env.OMNIHIVE_BOOT_LOADER_LOCATION),
                    "utf8"
                )
            );
        }
    } catch {
        throw new Error("No Valid Boot Loader Location Given...OmniHive Cannot Continue");
    }

    await global.omnihive.pushWorker(global.omnihive.bootLoaderSettings.configWorker, true, false);
    global.omnihive.bootWorkerNames.push(global.omnihive.bootLoaderSettings.configWorker.name);
    global.omnihive.serverSettings.workers.push(global.omnihive.bootLoaderSettings.configWorker);

    const pkgJson: NormalizedReadResult | undefined = await AwaitHelper.execute(readPkgUp());

    // Load Boot Workers
    if (pkgJson && pkgJson.packageJson && pkgJson.packageJson.omniHive && pkgJson.packageJson.omniHive.bootWorkers) {
        const bootWorkers: HiveWorker[] = pkgJson.packageJson.omniHive.bootWorkers as HiveWorker[];

        for (const bootWorker of bootWorkers) {
            if (!global.omnihive.registeredWorkers.some((rw: RegisteredHiveWorker) => rw.name === bootWorker.name)) {
                await AwaitHelper.execute(global.omnihive.pushWorker(bootWorker, true, false));
                global.omnihive.bootWorkerNames.push(bootWorker.name);
                global.omnihive.serverSettings.workers.push(bootWorker);
            }
        }
    }

    const configWorker: IConfigWorker | undefined = global.omnihive.getWorker<IConfigWorker>(HiveWorkerType.Config);

    if (!configWorker) {
        throw new Error("No config worker can be found.  OmniHive cannot load.");
    }

    global.omnihive.serverSettings = await AwaitHelper.execute(configWorker.get());

    switch (args.argv._[0]) {
        case "taskRunner":
            const taskRunnerService: TaskRunnerService = new TaskRunnerService();
            await AwaitHelper.execute(taskRunnerService.run(args.argv.worker as string, args.argv.args as string));
            break;
        case "server":
        default:
            const serverService: ServerService = new ServerService();
            await AwaitHelper.execute(serverService.boot());
            break;
    }

    nodeCleanup(() => {
        const adminService: AdminService = new AdminService();
        adminService.emitToCluster(AdminRoomType.Command, AdminEventType.StatusResponse, {
            serverStatus: ServerStatus.Offline,
            serverError: undefined,
        });
    });

    process.on("SIGUSR2", () => process.kill(process.pid, "SIGHUP"));
};

init();
