import chalk from "chalk";
import figlet from "figlet";
import fse from "fs-extra";
import path from "path";
import replaceInFile, { ReplaceInFileConfig } from "replace-in-file";
import yargs from "yargs";
import axios from "axios";
import { Listr } from "listr2";
import execa from "execa";
import { IsHelper } from "src/packages/omnihive-core/helpers/IsHelper";

const build = async (): Promise<void> => {
    // Handle args
    const cmdLineArgs = yargs(process.argv.slice(2));

    cmdLineArgs
        .help(false)
        .version(false)
        .strict()
        .option("version", {
            alias: "v",
            type: "string",
            demandCommand: false,
            description: "OmniHive version to build against.  Will use latest if not provided",
        })
        .option("publish", {
            alias: "p",
            type: "boolean",
            demandCommand: false,
            description: "Publish to NPM",
            default: false,
        })
        .option("publishAccess", {
            alias: "pa",
            type: "string",
            demandCommand: false,
            description: "Access to use when publishing to NPM",
            default: "public",
            choices: ["public", "restricted"],
        })
        .option("publishTag", {
            alias: "pt",
            type: "string",
            demandCommand: false,
            description: "Tag to use when publishing",
        });

    const args = await cmdLineArgs.argv;

    // Handle version number

    let buildNumber: string;

    if (!IsHelper.isNullOrUndefined(args.version) && IsHelper.isString(args.version)) {
        buildNumber = args.version as string;
    } else {
        const versions = (await axios.get("https://registry.npmjs.org/-/package/omnihive/dist-tags")).data;
        buildNumber = versions.latest;
    }

    // Header
    console.log(chalk.yellow(figlet.textSync("OMNIHIVE")));
    console.log();

    const tasks = setupTasks(args, buildNumber);
    await tasks.run();
};

// Main Listr setup
const setupTasks = (args: any, version: string): Listr<any> => {
    return new Listr<any>([
        {
            title: "Clear Out Existing Dist Directories",
            task: clearOutExistingDist,
            options: {
                showTimer: true,
            },
        },
        {
            title: "Build Repo",
            task: buildRepo,
            options: {
                showTimer: true,
            },
        },
        {
            title: "Update Package Versions",
            task: async () => await updateVersion(version),
            options: {
                showTimer: true,
            },
        },
        {
            title: "Publish Packages",
            skip: (_ctx) => args.argv.publish as boolean,
            task: (_ctx, task): Listr =>
                task.newListr(
                    getPublishFolders().map((directory) => ({
                        title: `Publishing ${directory}`,
                        task: () => publish(args, directory),
                        options: {
                            showTimer: true,
                            showSubtasks: true,
                        },
                    })),
                    { concurrent: true }
                ),
            options: {
                showTimer: true,
            },
        },
    ]);
};

// Listr task helpers
const buildRepo = () => {
    execa.commandSync("npx tsc -b --force", { cwd: path.join(`.`) });
};

const clearOutExistingDist = () => {
    fse.rmSync(path.join(`.`, `dist`), { recursive: true, force: true });
};

const getPublishFolders = () => {
    // Get all packages directories
    return fse
        .readdirSync(path.join(`.`, `dist`, `custom`))
        .filter((f) => fse.statSync(path.join(`.`, `dist`, `custom`, f)).isDirectory());
};

const publish = (args: any, directory: string) => {
    fse.rmdirSync(path.join(`.`, `dist`, `packages`, directory, `tests`), { recursive: true });

    let publishString: string = "npm publish";

    if (
        IsHelper.isBoolean(args.publishAccess) &&
        !IsHelper.isNullOrUndefined(args.publishAccess) &&
        args.publishAccess
    ) {
        publishString = `${publishString} --access ${args.argv.publishAccess as string}`;
    } else {
        publishString = `${publishString} --access public`;
    }

    if (IsHelper.isBoolean(args.publishTag) && !IsHelper.isNullOrUndefined(args.publishTag) && args.publishTag) {
        publishString = `${publishString} --tag ${args.argv.publishTag as string}`;
    }

    console.log(`Publishing NPM Package at ${directory}`);
    execa.commandSync(publishString, { cwd: path.join(`.`, `dist`, `packages`, `${directory}`) });
};

const updateVersion = async (buildNumber: string) => {
    // Patch package.json with latest OH version
    const replaceWorkspaceOptions: ReplaceInFileConfig = {
        allowEmptyPaths: true,
        files: [path.join(`dist`, `custom`, `**`, `package.json`)],
        from: /workspace:\*/g,
        to: `${buildNumber}`,
    };

    await replaceInFile.replaceInFile(replaceWorkspaceOptions);

    const replaceVersionOptions: ReplaceInFileConfig = {
        allowEmptyPaths: true,
        files: [path.join(`dist`, `custom`, `**`, `package.json`)],
        from: /"version": "0.0.1"/g,
        to: `"version": "${buildNumber}"`,
    };

    await replaceInFile.replaceInFile(replaceVersionOptions);
};

build();
