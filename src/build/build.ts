import chalk from "chalk";
import childProcess from "child_process";
import figlet from "figlet";
import fse from "fs-extra";
import path from "path";
import readPkgUp, { NormalizedReadResult } from "read-pkg-up";
import replaceInFile, { ReplaceInFileConfig } from "replace-in-file";
import semver from "semver";
import writePkg from "write-pkg";
import yargs from "yargs";
import axios from "axios";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { Listr } from "listr2";

// Elastic version record
type Version = {
    main: string;
    beta: string;
    dev: string;
};

const orangeHex: string = "#FFC022#";

const build = async (): Promise<void> => {
    let version: Version = {
        main: "",
        beta: "",
        dev: "",
    };

    // Get the current git branch
    const currentBranch: string = execSpawn("git branch --show-current", "./");

    // Handle args
    const args = yargs(process.argv.slice(2));

    args
        .help(false)
        .version(false)
        .strict()
        .option("version", {
            alias: "v",
            type: "string",
            demandCommand: false,
            description: "Build number to use.  Will use WOV Elastic provider if not provided",
        })
        .option("channel", {
            alias: "c",
            type: "string",
            demandOption: false,
            description: "Name of the channel you wish to build",
            choices: ["dev", "beta", "main"],
        })
        .option("type", {
            alias: "t",
            type: "string",
            demandOption: false,
            description: "Release type (major, minor, patch, prerelease)",
            choices: ["major", "minor", "patch", "prerelease"],
        })
        .option("publish", {
            alias: "p",
            type: "boolean",
            demandOption: false,
            description: "Publish to NPM and GitHub",
            default: false,
        })
        .option("publishAccess", {
            alias: "pa",
            type: "string",
            demandOption: false,
            description: "Access to use when publishing to NPM",
            choices: ["public", "restricted"],
        })
        .option("publishTag", {
            alias: "pt",
            type: "string",
            demandOption: false,
            description: "Tag to use when publishing",
        })
        .check((args) => {
            if (args.version && (args.channel || args.type)) {
                throw new Error("You cannot specify a predetermined version and specify a channel and/or a type");
            }

            if ((args.publishAccess || args.publishTag) && (args.publish === undefined || args.publish === false)) {
                throw new Error("You must add a publish flag to use tagging or access levels");
            }

            if (args.channel && args.channel !== currentBranch) {
                throw new Error(
                    "Your selected channel and your current git branch do not match.  Please choose a different channel or switch branches in git."
                );
            }

            if (args.channel === "main" && args.type === "prerelease") {
                throw new Error(
                    "You cannot specify the main channel and specify prerelease.  Prerelease is for dev and beta channels only."
                );
            }

            if (
                (args.channel === "dev" || args.channel === "beta") &&
                (args.type === "major" || args.type === "minor" || args.type === "patch")
            ) {
                throw new Error(
                    "You cannot specify a prerelease type and specify the main channel.  Prerelease is the only option for the dev or beta channel."
                );
            }
            return true;
        }).argv;

    if (!args.argv.version) {
        const versions = (await axios.get("https://registry.npmjs.org/-/package/omnihive/dist-tags")).data;

        version = {
            main: versions.latest,
            beta: versions.beta,
            dev: versions.dev,
        };
    } else {
        version = {
            main: args.argv.version as string,
            beta: args.argv.version as string,
            dev: args.argv.version as string,
        };
    }

    // Header
    console.log(chalk.yellow(figlet.textSync("OMNIHIVE")));
    console.log(chalk.hex(orangeHex)("Building OmniHive monorepo..."));
    console.log();

    const tasks = setupTasks(args, version);

    await tasks.run();
};

const setupTasks = (args: any, version: Version): Listr<any> => {
    const packages: string[] = getAllPackages();

    return new Listr<any>([
        {
            title: "Clear Out Existing Dist Directories",
            task: clearOutExistingDist,
            retry: 5,
            options: {
                persistentOutput: true,
                showTimer: true,
            },
        },
        {
            title: "Build Core Packages",
            task: (_ctx, task): Listr =>
                task.newListr(
                    getCorePackages(packages).map((directory) => ({
                        title: `Building ${directory}`,
                        task: async () => await buildPackage(directory),
                        retry: 5,
                        options: {
                            persistentOutput: true,
                            showTimer: true,
                            suffixRetries: true,
                            showSubtasks: true,
                        },
                    })),
                    { concurrent: true }
                ),
            retry: 5,
            options: {
                persistentOutput: true,
                showTimer: true,
            },
        },
        {
            title: "Build Workers",
            task: (_ctx, task): Listr =>
                task.newListr(
                    getWorkerPackages(packages).map((directory) => ({
                        title: `Building ${directory}`,
                        task: async () => await buildPackage(directory),
                        retry: 5,
                        options: {
                            persistentOutput: true,
                            showTimer: true,
                            suffixRetries: true,
                            showSubtasks: true,
                        },
                    })),
                    { concurrent: true }
                ),
            retry: 5,
            options: {
                persistentOutput: true,
                showTimer: true,
            },
        },
        {
            title: "Build Client",
            task: (_ctx, task): Listr =>
                task.newListr(
                    getClientPackage(packages).map((directory) => ({
                        title: `Building ${directory}`,
                        task: async () => await buildPackage(directory),
                        retry: 5,
                        options: {
                            persistentOutput: true,
                            showTimer: true,
                            suffixRetries: true,
                            showSubtasks: true,
                        },
                    })),
                    { concurrent: true }
                ),
            retry: 5,
            options: {
                persistentOutput: true,
                showTimer: true,
            },
        },
        {
            title: "Build Server",
            task: (_ctx, task): Listr =>
                task.newListr(
                    getServerPackage(packages).map((directory) => ({
                        title: `Building ${directory}`,
                        task: async () => await buildPackage(directory),
                        retry: 5,
                        options: {
                            persistentOutput: true,
                            showTimer: true,
                            suffixRetries: true,
                            showSubtasks: true,
                        },
                    })),
                    { concurrent: true }
                ),
            retry: 5,
            options: {
                persistentOutput: true,
                showTimer: true,
            },
        },
        {
            title: "Copy miscellaneous OmniHive files",
            task: (_ctx, task): Listr =>
                task.newListr(
                    [
                        ...getMiscFiles().map((file) => ({
                            title: `Copying Ignore Files`,
                            task: async () => await copyMiscFile(file),
                        })),
                        ...getMiscFolders().map((directory) => ({
                            title: `Copying Required Directories`,
                            task: async () => await copyMiscFolder(directory),
                            retry: 5,
                            options: {
                                persistentOutput: true,
                                showTimer: true,
                                suffixRetries: true,
                                showSubtasks: true,
                            },
                        })),
                    ],
                    { concurrent: true }
                ),
            retry: 5,
            options: {
                persistentOutput: true,
                showTimer: true,
            },
        },
        {
            title: "Remove non-core packages from OmniHive package.json",
            task: removeNonCorePackages,
            retry: 5,
            options: {
                persistentOutput: true,
                showTimer: true,
            },
        },
        {
            title: "Update Package Versions",
            task: async () => await updateVersion(args, version),
            retry: 5,
            options: {
                persistentOutput: true,
                showTimer: true,
            },
        },
        {
            title: "Publish Core Packages",
            skip: (_ctx) => !getPublishFlag(args),
            task: (_ctx, task): Listr =>
                task.newListr(
                    getCorePackages(packages).map((directory) => ({
                        title: `Publishing ${directory}`,
                        task: async () => await publish(args, directory),
                        retry: 5,
                        options: {
                            persistentOutput: true,
                            showTimer: true,
                            suffixRetries: true,
                            showSubtasks: true,
                        },
                    })),
                    { concurrent: true }
                ),
            retry: 5,
            options: {
                persistentOutput: true,
                showTimer: true,
            },
        },
        {
            title: "Publish Workers",
            skip: (_ctx) => !getPublishFlag(args),
            task: (_ctx, task): Listr =>
                task.newListr(
                    getWorkerPackages(packages).map((directory) => ({
                        title: `Publishing ${directory}`,
                        task: async () => await publish(args, directory),
                        retry: 5,
                        options: {
                            persistentOutput: true,
                            showTimer: true,
                            suffixRetries: true,
                            showSubtasks: true,
                        },
                    })),
                    { concurrent: true }
                ),
            retry: 5,
            options: {
                persistentOutput: true,
                showTimer: true,
            },
        },
        {
            title: "Publish Client",
            skip: (_ctx) => !getPublishFlag(args),
            task: (_ctx, task): Listr =>
                task.newListr(
                    getClientPackage(packages).map((directory) => ({
                        title: `Publishing ${directory}`,
                        task: async () => await publish(args, directory),
                        retry: 5,
                        options: {
                            persistentOutput: true,
                            showTimer: true,
                            suffixRetries: true,
                            showSubtasks: true,
                        },
                    })),
                    { concurrent: true }
                ),
            retry: 5,
            options: {
                persistentOutput: true,
                showTimer: true,
            },
        },
        {
            title: "Publish Server",
            skip: (_ctx) => !getPublishFlag(args),
            task: (_ctx, task): Listr =>
                task.newListr(
                    getServerPackage(packages).map((directory) => ({
                        title: `Publishing ${directory}`,
                        task: async () => await publish(args, directory),
                        retry: 5,
                        options: {
                            persistentOutput: true,
                            showTimer: true,
                            suffixRetries: true,
                            showSubtasks: true,
                        },
                    })),
                    { concurrent: true }
                ),
            retry: 5,
            options: {
                persistentOutput: true,
                showTimer: true,
            },
        },
    ]);
};

const clearOutExistingDist = () => {
    // Clear out existing dist directory
    console.log(chalk.yellow("Clearing existing dist directory..."));
    fse.rmSync(path.join(`.`, `dist`), { recursive: true, force: true });
    console.log(chalk.greenBright("Done clearing existing dist directory..."));
};

const getAllPackages = () => {
    // Get all packages directories
    return fse
        .readdirSync(path.join(`.`, `src`, `packages`))
        .filter((f) => fse.statSync(path.join(`.`, `src`, `packages`, f)).isDirectory());
};

const getCorePackages = (directories: string[]) => {
    return directories.filter((value: string) => value === "omnihive-core");
};

const getWorkerPackages = (directories: string[]) => {
    return directories.filter((value: string) => value.startsWith("omnihive-worker"));
};

const getClientPackage = (directories: string[]) => {
    return directories.filter((value: string) => value === "omnihive-client");
};

const getServerPackage = (directories: string[]) => {
    return directories.filter((value: string) => value === "omnihive");
};

const buildPackage = async (directory: string) => {
    await execSpawn("yarn run build", path.join(`.`, `src`, `packages`, `${directory}`));
    fse.copySync(
        path.join(`.`, `src`, `packages`, `${directory}`, `package.json`),
        path.join(`.`, `dist`, `packages`, `${directory}`, `package.json`)
    );
};

const getMiscFiles = () => {
    return [".npmignore"];
};

const copyMiscFile = async (file: string) => {
    await fse.copyFile(
        path.join(`.`, `src`, `packages`, `omnihive`, `${file}`),
        path.join(`.`, `dist`, `packages`, `omnihive`, `${file}`)
    );
};

const getMiscFolders = () => {
    return [path.join(`app`, `public`), path.join(`app`, `views`), "templates"];
};

const copyMiscFolder = async (folder: string) => {
    await fse.copy(
        path.join(`.`, `src`, `packages`, `omnihive`, `${folder}`),
        path.join(`.`, `dist`, `packages`, `omnihive`, `${folder}`)
    );
};

const removeNonCorePackages = async () => {
    const packageJson: NormalizedReadResult | undefined = await AwaitHelper.execute(
        readPkgUp({
            cwd: path.join(`.`, `dist`, `packages`, `omnihive`),
        })
    );

    const corePackages: any = packageJson?.packageJson.omniHive.coreDependencies;
    const loadedPackages: any = packageJson?.packageJson.dependencies;

    for (const loadedPackage of Object.entries(loadedPackages)) {
        let removeLoadedPackage: boolean = true;

        for (const corePackage of Object.entries(corePackages)) {
            if (corePackage[0] === loadedPackage[0] && corePackage[1] === loadedPackage[1]) {
                removeLoadedPackage = false;
                break;
            }
        }

        if (removeLoadedPackage) {
            if (packageJson && packageJson.packageJson && packageJson.packageJson.dependencies) {
                delete packageJson.packageJson.dependencies[loadedPackage[0]];
            }
        }
    }

    if (packageJson && packageJson.packageJson) {
        await writePkg(path.join(`.`, `dist`, `packages`, `omnihive`), packageJson.packageJson);
    }
};

const updateVersion = async (args: any, version: Version) => {
    let currentVersion: string = "";

    if (args.argv.version) {
        currentVersion = version.main;
    } else {
        switch (args.argv.type) {
            case "prerelease":
                switch (args.argv.channel) {
                    case "dev":
                        currentVersion = semver.inc(version.dev, "prerelease", false, "dev") ?? "";

                        if (!currentVersion || currentVersion === "") {
                            console.log(chalk.red("SemVer is incorrect"));
                            process.exit();
                        }

                        version.dev = currentVersion;
                        break;
                    case "beta":
                        currentVersion = semver.inc(version.beta, "prerelease", false, "beta") ?? "";

                        if (!currentVersion || currentVersion === "") {
                            console.log(chalk.red("SemVer is incorrect"));
                            process.exit();
                        }

                        version.beta = currentVersion;
                        break;
                    default:
                        console.log(chalk.red("Must have dev or beta channel with prerelease"));
                        process.exit();
                }
                break;
            case "major":
                currentVersion = semver.inc(version.main, "major") ?? "";

                if (!currentVersion || currentVersion === "") {
                    console.log(chalk.red("SemVer is incorrect"));
                    process.exit();
                }

                version.main = currentVersion;
                version.beta = semver.inc(currentVersion, "prerelease", false, "beta") ?? "";
                version.dev = semver.inc(currentVersion, "prerelease", false, "dev") ?? "";
                break;
            case "minor":
                currentVersion = semver.inc(version.main, "minor") ?? "";

                if (!currentVersion || currentVersion === "") {
                    console.log(chalk.red("SemVer is incorrect"));
                    process.exit();
                }

                version.main = currentVersion;
                version.beta = semver.inc(currentVersion, "prerelease", false, "beta") ?? "";
                version.dev = semver.inc(currentVersion, "prerelease", false, "dev") ?? "";
                break;
            default:
                currentVersion = semver.inc(version.main, "patch") ?? "";

                if (!currentVersion || currentVersion === "") {
                    console.log(chalk.red("SemVer is incorrect"));
                    process.exit();
                }

                version.main = currentVersion;
                version.beta = semver.inc(currentVersion, "prerelease", false, "beta") ?? "";
                version.dev = semver.inc(currentVersion, "prerelease", false, "dev") ?? "";
                break;
        }
    }

    // Patch package.json with SemVer
    console.log(chalk.yellow("Patching package.json files..."));

    const replaceWorkspaceOptions: ReplaceInFileConfig = {
        allowEmptyPaths: true,
        files: [path.join(`dist`, `packages`, `**`, `package.json`)],
        from: /workspace:\*/g,
        to: `${currentVersion}`,
    };

    await replaceInFile.replaceInFile(replaceWorkspaceOptions);

    const replaceVersionOptions: ReplaceInFileConfig = {
        allowEmptyPaths: true,
        files: [path.join(`dist`, `packages`, `**`, `package.json`)],
        from: /"version": "0.0.1"/g,
        to: `"version": "${currentVersion}"`,
    };

    await replaceInFile.replaceInFile(replaceVersionOptions);
};

const getPublishFlag = (args: any) => args.argv.publish as boolean;

const publish = async (args: any, directory: string) => {
    let publishString: string = "npm publish";

    if (args.argv.publishAccess) {
        publishString = `${publishString} --access ${args.argv.publishAccess as string}`;
    } else {
        publishString = `${publishString} --access public`;
    }

    if (args.argv.publishTag) {
        publishString = `${publishString} --tag ${args.argv.publishTag as string}`;
    }
    await execSpawn(publishString, path.join(`.`, `dist`, `packages`, `${directory}`));
    await execSpawn("npm pack", path.join(`.`, `dist`, `packages`, `${directory}`));
};

const execSpawn = (commandString: string, cwd: string): string => {
    const execSpawn = childProcess.spawnSync(commandString, {
        shell: true,
        cwd,
        stdio: ["inherit", "pipe", "pipe"],
    });

    if (execSpawn.status !== 0) {
        if (execSpawn.stdout?.length > 0) {
            console.log(chalk.red(execSpawn.stdout.toString().trim()));
        } else if (execSpawn.stderr?.length > 0) {
            console.log(chalk.red(execSpawn.stderr.toString().trim()));
        } else if (execSpawn.error) {
            console.log(chalk.red(execSpawn.error.message));
        }
        process.exit(1);
    }

    const execOut = execSpawn.stdout.toString().trim();

    if (execOut && execOut !== "") {
        return execOut;
    } else {
        return "";
    }
};

build();
