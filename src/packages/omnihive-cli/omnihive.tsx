#!/usr/bin/env node
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";
import { render } from "ink";
import React from "react";
import yargs from "yargs";
import { CommandLineModule } from "./enums/CommandLineModule";
import AppRoot from "./AppRoot";
import clear from "clear";

const run = async (): Promise<void> => {
    clear();
    const cmdLineArgs = yargs(process.argv.slice(2));

    cmdLineArgs.help(true).version(false).strict().option("create", {
        alias: "c",
        type: "boolean",
        demandOption: false,
        description: "Create a new OmniHive instance",
    });

    const args = await cmdLineArgs.argv;
    let selectedModule: CommandLineModule = CommandLineModule.MainMenu;

    if (!IsHelper.isNullOrUndefined(args) && args._.some((value) => value === "create")) {
        selectedModule = CommandLineModule.CreateInstance;
    }

    if (!IsHelper.isNullOrUndefined(args) && !IsHelper.isNullOrUndefined(args.create)) {
        selectedModule = CommandLineModule.CreateInstance;
    }

    render(<AppRoot selectedModule={selectedModule} />);
};

run();
