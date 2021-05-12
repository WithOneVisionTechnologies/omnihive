import chalk from "chalk";
import childProcess from "child_process";
import dayjs from "dayjs";
import figlet from "figlet";
import fse from "fs-extra";
import path from "path";
import readPkgUp, { NormalizedReadResult } from "read-pkg-up";
import replaceInFile, { ReplaceInFileConfig } from "replace-in-file";
import semver from "semver";
import tar from "tar";
import writePkg from "write-pkg";
import yargs from "yargs";
import axios from "axios";
import { AwaitHelper } from "src/packages/omnihive-core/helpers/AwaitHelper";

// Elastic version record
type Version = {
    main: string;
    beta: string;
    dev: string;
};

const orangeHex: string = "#FFC022#";

const build = async (): Promise<void> => {
    const startTime: dayjs.Dayjs = dayjs();

    // Define elastic client if needed
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

    // Clear out existing dist directory
    console.log(chalk.yellow("Clearing existing dist directory..."));
    fse.rmSync(path.join(`.`, `dist`), { recursive: true, force: true });
    console.log(chalk.greenBright("Done clearing existing dist directory..."));

    // Get all packages directories
    const directories: string[] = fse
        .readdirSync(path.join(`.`, `src`, `packages`))
        .filter((f) => fse.statSync(path.join(`.`, `src`, `packages`, f)).isDirectory());

    // Build core libraries
    console.log();
    console.log(chalk.blue("Building core libraries..."));

    directories
        .filter((value: string) => value === "omnihive-core")
        .forEach((value: string) => {
            console.log(chalk.yellow(`Building ${value}...`));
            execSpawn("yarn run build", path.join(`.`, `src`, `packages`, `${value}`));
            fse.copySync(
                path.join(`.`, `src`, `packages`, `${value}`, `package.json`),
                path.join(`.`, `dist`, `packages`, `${value}`, `package.json`)
            );

            console.log(chalk.greenBright(`Done building ${value}...`));
        });

    console.log(chalk.blue("Done building core libraries..."));
    console.log();

    // Build workers
    console.log(chalk.blue("Building workers..."));

    directories
        .filter((value: string) => value.startsWith("omnihive-worker"))
        .forEach((value: string) => {
            console.log(chalk.yellow(`Building ${value}...`));
            execSpawn("yarn run build", path.join(`.`, `src`, `packages`, `${value}`));
            fse.copySync(
                path.join(`.`, `src`, `packages`, `${value}`, `package.json`),
                path.join(`.`, `dist`, `packages`, `${value}`, `package.json`)
            );
            console.log(chalk.greenBright(`Done building ${value}...`));
        });

    console.log(chalk.blue("Done building workers..."));
    console.log();

    // Build client and server
    console.log(chalk.blue("Building client and server..."));

    directories
        .filter((value: string) => value === "omnihive-client")
        .forEach((value: string) => {
            console.log(chalk.yellow(`Building ${value}...`));
            execSpawn("yarn run build", path.join(`.`, `src`, `packages`, `${value}`));
            fse.copySync(
                path.join(`.`, `src`, `packages`, `${value}`, `package.json`),
                path.join(`.`, `dist`, `packages`, `${value}`, `package.json`)
            );
            console.log(chalk.greenBright(`Done building ${value}...`));
        });

    directories
        .filter((value: string) => value === "omnihive")
        .forEach((value: string) => {
            console.log(chalk.yellow(`Building main server package ${value}...`));
            execSpawn("yarn run build", path.join(`.`, `src`, `packages`, `${value}`));
            fse.copySync(
                path.join(`.`, `src`, `packages`, `${value}`, `package.json`),
                path.join(`.`, `dist`, `packages`, `${value}`, `package.json`)
            );
            console.log(chalk.greenBright(`Done building main server package ${value}...`));
        });

    //Copy over miscellaneous files (npmignore, pug, etc.)
    console.log(chalk.yellow("Copying miscellaneous OmniHive files..."));

    const miscFiles = [".npmignore"];

    miscFiles.forEach((value: string) => {
        fse.copyFileSync(
            path.join(`.`, `src`, `packages`, `omnihive`, `${value}`),
            path.join(`.`, `dist`, `packages`, `omnihive`, `${value}`)
        );
    });

    const miscFolders = [path.join(`app`, `public`), path.join(`app`, `views`), "templates"];

    miscFolders.forEach((value: string) => {
        fse.copySync(
            path.join(`.`, `src`, `packages`, `omnihive`, `${value}`),
            path.join(`.`, `dist`, `packages`, `omnihive`, `${value}`)
        );
    });

    console.log(chalk.greenBright("Done copying miscellaneous OmniHive files..."));

    //Remove non-core packages from package.json in server
    console.log(chalk.yellow("Removing non-core packages from OmniHive package.json..."));

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

    console.log(chalk.greenBright("Done removing non-core packages from OmniHive package.json..."));

    console.log(chalk.blue("Done building client and server..."));
    console.log();

    // Handle version maintenance
    console.log(chalk.blue("Version maintenance..."));

    // SemVer Updates
    console.log(chalk.yellow("Getting semver..."));

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

    console.log(chalk.greenBright(`Done getting semver ${currentVersion}...`));

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

    console.log(chalk.greenBright("Done patching package.json files..."));

    // Finish version maintenance
    console.log(chalk.blue("Done with version maintenance..."));
    console.log();

    // Check for publish flag and start publish if there
    if (!args.argv.publish as boolean) {
        console.log(chalk.redBright("Publish not specified...skipping npm publish"));
    } else {
        let publishString: string = "npm publish";

        if (args.argv.publishAccess) {
            publishString = `${publishString} --access ${args.argv.publishAccess as string}`;
        } else {
            publishString = `${publishString} --access public`;
        }

        if (args.argv.publishTag) {
            publishString = `${publishString} --tag ${args.argv.publishTag as string}`;
        }

        // Publish core libraries
        console.log(chalk.blue("Publishing core libraries..."));

        directories
            .filter((value: string) => value === "omnihive-core")
            .forEach((value: string) => {
                console.log(chalk.yellow(`Publishing ${value}...`));
                execSpawn(publishString, path.join(`.`, `dist`, `packages`, `${value}`));
                execSpawn("npm pack", path.join(`.`, `dist`, `packages`, `${value}`));
                console.log(chalk.greenBright(`Done publishing ${value}...`));
            });

        console.log(chalk.blue("Done publishing core libraries..."));
        console.log();

        // Publish workers
        console.log(chalk.blue("Publishing workers..."));

        directories
            .filter((value: string) => value.startsWith("omnihive-worker"))
            .forEach((value: string) => {
                console.log(chalk.yellow(`Publishing ${value}...`));
                execSpawn(publishString, path.join(`.`, `dist`, `packages`, `${value}`));
                execSpawn("npm pack", path.join(`.`, `dist`, `packages`, `${value}`));
                console.log(chalk.greenBright(`Done publishing ${value}...`));
            });

        console.log(chalk.blue("Done publishing workers..."));
        console.log();

        // Publish client and server
        console.log(chalk.blue("Publishing client and server..."));

        directories
            .filter((value: string) => value === "omnihive-client")
            .forEach((value: string) => {
                console.log(chalk.yellow(`Publishing ${value}...`));
                execSpawn(publishString, path.join(`.`, `dist`, `packages`, `${value}`));
                execSpawn("npm pack", path.join(`.`, `dist`, `packages`, `${value}`));
                console.log(chalk.greenBright(`Done publishing ${value}...`));
            });

        directories
            .filter((value: string) => value === "omnihive")
            .forEach((value: string) => {
                console.log(chalk.yellow(`Publishing ${value}...`));
                execSpawn(publishString, path.join(`.`, `dist`, `packages`, `${value}`));
                execSpawn("npm pack", path.join(`.`, `dist`, `packages`, `${value}`));
                tar.create(
                    {
                        cwd: path.join(`.`, `dist`, `packages`, `${value}`),
                        file: `${value}-${currentVersion}.tgz`,
                        gzip: true,
                    },
                    ["*"]
                );
                console.log(chalk.greenBright(`Done publishing ${value}...`));
            });

        console.log(chalk.blue("Done publishing client server..."));
    }

    // Close out
    console.log();
    console.log(chalk.hex(orangeHex)("Done building OmniHive monorepo..."));
    console.log();

    const endTime: dayjs.Dayjs = dayjs();

    console.log(chalk.hex(orangeHex)(`Elapsed Time: ${endTime.diff(startTime, "seconds")} seconds`));
    process.exit();
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
