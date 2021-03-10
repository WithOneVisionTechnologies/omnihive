#!/usr/bin/env node
/// <reference path="../../types/globals.omnihive.d.ts" />

import { ObjectHelper } from "@withonevision/omnihive-core/helpers/ObjectHelper";
import { StringHelper } from "@withonevision/omnihive-core/helpers/StringHelper";
import { ServerSettings } from "@withonevision/omnihive-core/models/ServerSettings";
import chalk from "chalk";
import Conf from "conf";
import crypto from "crypto";
import dotenv from "dotenv";
import figlet from "figlet";
import fse from "fs-extra";
import inquirer from "inquirer";
import path from "path";
import yargs from "yargs";
import { GlobalObject } from "./models/GlobalObject";
import { AdminService } from "./services/AdminService";
import { ServerService } from "./services/ServerService";
import { TaskRunnerService } from "./services/TaskRunnerService";

const init = async () => {
    global.omnihive = new GlobalObject();

    const config = new Conf();
    const latestConf: string | undefined = config.get<string>("latest-settings") as string;
    const newAdminPassword = crypto.randomBytes(32).toString("hex");

    global.omnihive.ohDirName = __dirname;

    if (!process.env.omnihive_settings) {
        dotenv.config();
    }

    const args = yargs(process.argv.slice(2));

    args
        .help(false)
        .version(false)
        .strict()
        .command(["*", "server"], "Server Runner", (args) => {
            return args
                .option("settings", {
                    alias: "s",
                    type: "string",
                    demandOption: false,
                    description: "Full path to settings file",
                })
                .option("adminPort", {
                    alias: "a",
                    type: "number",
                    demandOption: false,
                    description: "Admin port number",
                })
                .option("nodePort", {
                    alias: "n",
                    type: "number",
                    demandOption: false,
                    description: "Node port number",
                })
                .option("webRootUrl", {
                    alias: "w",
                    type: "string",
                    demandOption: false,
                    description: "Web Root URL (with port number if necessary)",
                })
                .check((args) => {
                    if (args.settings) {
                        try {
                            ObjectHelper.createStrict<ServerSettings>(
                                ServerSettings,
                                JSON.parse(fse.readFileSync(args.settings, { encoding: "utf8" }))
                            );
                            return true;
                        } catch {
                            return false;
                        }
                    }

                    if (args.webRootUrl) {
                        try {
                            const url = new URL(args.webRootUrl);

                            if (url) {
                                return true;
                            } else {
                                return "This URL is not valid.  Try a different URL.";
                            }
                        } catch {
                            return "This URL is not valid.  Try a different URL.";
                        }
                    }

                    return true;
                });
        })
        .command("taskRunner", "Command-Line Task Runner", (args) => {
            return args
                .option("settings", {
                    alias: "s",
                    type: "string",
                    demandOption: false,
                    description: "Full path to settings file",
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
                })
                .check((args) => {
                    if (args.settings) {
                        try {
                            ObjectHelper.createStrict<ServerSettings>(
                                ServerSettings,
                                JSON.parse(fse.readFileSync(args.settings, { encoding: "utf8" }))
                            );
                            return true;
                        } catch {
                            return false;
                        }
                    }

                    return true;
                });
        })
        .command("init", "Init a new instance of OmniHive").argv;

    console.log(chalk.yellow(figlet.textSync("OMNIHIVE")));
    console.log();

    let finalSettings: string | undefined = undefined;

    if (args.argv._[0] === "init") {
        console.log(chalk.yellow("Let's get an instance set up and running for you!"));
        console.log();
        const answers = await inquirer.prompt([
            {
                type: "input",
                name: "path",
                message: `Where do you want to save the setting file?`,
                default: `${process.cwd()}/omnihive_settings.json`,
                validate: (value) => {
                    try {
                        const path: string = `${value as string}`;
                        const exists: boolean = fse.existsSync(path);

                        if (!exists) {
                            return true;
                        }

                        return "This file path already exists.  Please choose a different file path.";
                    } catch {
                        return "This answer generated an unknown error.  Please try again.";
                    }
                },
            },
            {
                type: "input",
                name: "adminPassword",
                message: "What is your preferred admin password?",
                default: newAdminPassword,
            },
            {
                type: "number",
                name: "nodePort",
                message: "What port number do you want for the node server?",
                default: 3001,
            },
            {
                type: "number",
                name: "adminPort",
                message: "What port number do you want for the admin server?",
                default: 7205,
            },
            {
                type: "input",
                name: "webRootUrl",
                message: "What is your root URL (with port if necessary)?",
                default: "http://localhost:3001",
                validate: (value) => {
                    try {
                        const url = new URL(value);

                        if (url) {
                            return true;
                        } else {
                            return "This URL is not valid.  Try a different URL.";
                        }
                    } catch {
                        return "This URL is not valid.  Try a different URL.";
                    }
                },
            },
        ]);

        const settings: ServerSettings = ObjectHelper.createStrict<ServerSettings>(
            ServerSettings,
            JSON.parse(
                fse.readFileSync(path.join(global.omnihive.ohDirName, `templates`, `default_config.json`), {
                    encoding: "utf8",
                })
            )
        );

        settings.config.adminPassword = answers.adminPassword as string;
        settings.config.adminPortNumber = answers.adminPort as number;
        settings.config.nodePortNumber = answers.nodePort as number;
        settings.config.webRootUrl = answers.webRootUrl as string;

        settings.constants.ohEncryptionKey = crypto.randomBytes(16).toString("hex");
        settings.constants.ohTokenAudience = crypto.randomBytes(32).toString("hex");
        settings.constants.ohTokenSecret = crypto.randomBytes(32).toString("hex");

        fse.writeFileSync(answers.path as string, JSON.stringify(settings));
        config.clear();
        config.set<string>("latest-settings", answers.path as string);

        console.log(chalk.green("OmniHive Server init complete!  Booting the server now..."));
        console.log();

        finalSettings = answers.path;
    } else {
        let continueSettingsSearch: boolean = true;

        if (args.argv.settings && !StringHelper.isNullOrWhiteSpace(args.argv.settings as string)) {
            config.clear();
            config.set<string>("latest-settings", args.argv.settings as string);
            finalSettings = args.argv.settings as string;
            continueSettingsSearch = false;
        }

        if (
            continueSettingsSearch &&
            process.env.omnihive_settings &&
            !StringHelper.isNullOrWhiteSpace(process.env.omnihive_settings)
        ) {
            config.clear();
            config.set<string>("latest-settings", process.env.omnihive_settings as string);
            finalSettings = process.env.omnihive_settings as string;
            continueSettingsSearch = false;
        }

        if (continueSettingsSearch && !finalSettings && latestConf && !StringHelper.isNullOrWhiteSpace(latestConf)) {
            finalSettings = latestConf;
            continueSettingsSearch = false;
        }

        if (continueSettingsSearch) {
            console.log(chalk.red("Cannot find any valid settings.  Please provide env file or -s"));
            process.exit();
        }
    }

    let serverSettings: ServerSettings;

    if (finalSettings) {
        serverSettings = ObjectHelper.createStrict<ServerSettings>(
            ServerSettings,
            JSON.parse(fse.readFileSync(finalSettings as string, { encoding: "utf8" }))
        );
    } else {
        serverSettings = ObjectHelper.createStrict<ServerSettings>(
            ServerSettings,
            JSON.parse(fse.readFileSync(process.env.omnihive_settings as string, { encoding: "utf8" }))
        );
    }

    if (args.argv.nodePort) {
        serverSettings.config.nodePortNumber = args.argv.nodePort as number;
    }

    if (args.argv.adminPort) {
        serverSettings.config.adminPortNumber = args.argv.adminPort as number;
    }

    if (args.argv.webRootUrl) {
        serverSettings.config.webRootUrl = args.argv.webRootUrl as string;
    }

    global.omnihive.serverSettings = serverSettings;

    switch (args.argv._[0]) {
        case "taskRunner":
            const taskRunnerService: TaskRunnerService = new TaskRunnerService();
            await taskRunnerService.run(args.argv.worker as string, args.argv.args as string);
            break;
        case "init":
        case "server":
        default:
            if (args.argv._[0] === "init") {
                console.log(
                    chalk.yellow(
                        `New Server Starting => Admin Password: ${global.omnihive.serverSettings.config.adminPassword}`
                    )
                );
                console.log();
            }
            const adminService: AdminService = new AdminService();
            await adminService.run();

            const serverService: ServerService = new ServerService();
            await serverService.run();
            break;
    }
};

init();
