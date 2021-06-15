#!/usr/bin/env node
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";
import yargs from "yargs";
import { CommandLineArgs } from "./models/CommandLineArgs";
import { ServerService } from "./services/ServerService";

const run = async () => {
    const serverService = new ServerService();

    const input = await yargs(process.argv.slice(2)).argv;

    const runningDir: string = __dirname;
    const commandLineArgs: CommandLineArgs = new CommandLineArgs();
    commandLineArgs.ipcServerId = input._[0] as string;

    if (!IsHelper.isNullOrUndefined(input._) && input._.length > 1) {
        commandLineArgs.environmentFile = input._[1] as string;
    }

    serverService.run(runningDir, commandLineArgs);
};

run();
