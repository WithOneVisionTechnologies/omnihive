import chalk from "chalk";
import figlet from "figlet";
import fse from "fs-extra";
import path from "path";
import readPkgUp, { NormalizedReadResult } from "read-pkg-up";
import writePkg from "write-pkg";
import yargs from "yargs";
import { Listr } from "listr2";
import execa from "execa";
import replaceInFile, { ReplaceInFileConfig } from "replace-in-file";
import tar from "tar";
import { IsHelper } from "src/packages/omnihive-core/helpers/IsHelper";

// Master build process
const build = async (): Promise<void> => {
    // Handle args
    const cmdLineArgs = yargs(process.argv.slice(2));

    cmdLineArgs
        .help(false)
        .version(false)
        .strict()
        .option("debug", {
            alias: "d",
            type: "boolean",
            demandOption: false,
            description: "Debug Mode (Test Only)",
            default: false,
        })
        .option("tag", {
            alias: "t",
            type: "string",
            demandOption: false,
            description: "NPM Dist Tag",
            default: "latest",
        });

    const args = await cmdLineArgs.argv;

    // Header
    console.log(chalk.yellow(figlet.textSync("OMNIHIVE")));
    console.log();

    const tasks = setupTasks(args.debug as boolean, args.tag as string);

    try {
        await tasks.run();
    } catch (err) {
        console.log(err);
        process.exit(1);
    }
};

// Main Listr setup
const setupTasks = (debug: boolean, distTag: string): Listr<any> => {
    return new Listr<any>([
        {
            title: "Run Standard Version",
            task: () => runVersioning(debug),
            exitOnError: true,
            options: {
                showTimer: true,
            },
        },
        {
            title: "Clear Out Existing Dist Directories",
            task: clearOutExistingDist,
            exitOnError: true,
            options: {
                showTimer: true,
            },
        },
        {
            title: "Build Repo",
            task: buildRepo,
            exitOnError: true,
            options: {
                showTimer: true,
            },
        },
        {
            title: "Copy required files and folders",
            task: (_ctx, task): Listr =>
                task.newListr(
                    [
                        ...getRequiredFiles().map((file) => ({
                            title: `Copying Required Files`,
                            task: () => copyRequiredFile(file),
                        })),
                        ...getRequiredFolders().map((directory) => ({
                            title: `Copying Required Directories`,
                            task: () => copyRequiredFolder(directory),
                            options: {
                                showTimer: true,
                                showSubtasks: true,
                            },
                        })),
                    ],
                    { concurrent: true }
                ),
            exitOnError: true,
            options: {
                showTimer: true,
            },
        },
        {
            title: "Remove non-core packages from OmniHive package.json",
            task: async () => removeNonCorePackagesFromMainPackageJson(),
            exitOnError: true,
            options: {
                showTimer: true,
            },
        },
        {
            title: "Update Package Versions",
            task: async () => await updateVersion(),
            options: {
                showTimer: true,
            },
        },
        {
            title: "Create release tarball",
            task: createTarball,
            options: {
                showTimer: true,
            },
        },
        {
            title: "Publish Packages",
            skip: (_ctx) => debug,
            task: (_ctx, task): Listr =>
                task.newListr(
                    getPublishFolders().map((directory) => ({
                        title: `Publishing ${directory}`,
                        task: () => publish(directory, distTag),
                        retry: 5,
                        options: {
                            showTimer: true,
                            showSubtasks: true,
                        },
                    })),
                    { concurrent: true }
                ),
            exitOnError: true,
            options: {
                showTimer: true,
            },
        },
        {
            title: "Push GitHub changes",
            skip: (_ctx) => debug,
            task: pushGithubChanges,
            exitOnError: true,
            options: {
                showTimer: true,
            },
        },
    ]);
};

// Listr task helpers
const buildRepo = () => {
    execa.commandSync("yarn run build:webAdmin", { cwd: path.join(`.`, `src`, `packages`, `omnihive`) });
    execa.commandSync("npx tsc -b --force", { cwd: path.join(`.`) });
};

const clearOutExistingDist = () => {
    fse.rmSync(path.join(`.`, `dist`), { recursive: true, force: true });
};

const copyRequiredFile = (file: string) => {
    fse.copyFileSync(path.join(`.`, `src`, `packages`, `${file}`), path.join(`.`, `dist`, `packages`, `${file}`));
};

const copyRequiredFolder = (folder: string) => {
    fse.copySync(path.join(`.`, `src`, `packages`, `${folder}`), path.join(`.`, `dist`, `packages`, `${folder}`));
};

const createTarball = () => {
    tar.c(
        {
            gzip: true,
            cwd: path.join(".", "dist", "packages", "omnihive"),
        },
        ["."]
    ).pipe(fse.createWriteStream("./omnihive.tgz"));
};

const getPublishFolders = () => {
    // Get all packages directories
    return fse
        .readdirSync(path.join(`.`, `dist`, `packages`))
        .filter((f) => fse.statSync(path.join(`.`, `dist`, `packages`, f)).isDirectory());
};

const getRequiredFiles = () => {
    return [
        path.join(`omnihive`, `.npmignore`),
        path.join(`omnihive`, `next-env.d.ts`),
        path.join(`omnihive`, `next.config.js`),
        path.join(`omnihive`, `postcss.config.js`),
        path.join(`omnihive`, `tailwind.config.js`),
        path.join(`omnihive-worker-knex-mssql`, `.npmignore`),
        path.join(`omnihive-worker-knex-mssql`, `defaultProcFunctions.sql`),
        path.join(`omnihive-worker-knex-mssql`, `defaultTables.sql`),
        path.join(`omnihive-worker-knex-mysql`, `.npmignore`),
        path.join(`omnihive-worker-knex-mysql`, `defaultProcFunctions.sql`),
        path.join(`omnihive-worker-knex-mysql`, `defaultTables.sql`),
        path.join(`omnihive-worker-knex-postgres`, `.npmignore`),
        path.join(`omnihive-worker-knex-postgres`, `defaultProcFunctions.sql`),
        path.join(`omnihive-worker-knex-postgres`, `defaultTables.sql`),
        path.join(`omnihive-worker-knex-sqlite`, `.npmignore`),
        path.join(`omnihive-worker-knex-sqlite`, `defaultTables.sql`),
    ];
};

const getRequiredFolders = () => {
    return [path.join(`omnihive`, `.next`), path.join(`omnihive`, `public`)];
};

const publish = (directory: string, distTag: string) => {
    fse.rmdirSync(path.join(`.`, `dist`, `packages`, directory, `tests`), { recursive: true });

    let publishString: string = "npm publish --access public";

    if (!IsHelper.isEmptyStringOrWhitespace(distTag) && distTag !== "latest") {
        publishString = `${publishString} --tag ${distTag}`;
    }

    console.log(`Publishing NPM Package at ${directory}`);
    execa.commandSync(publishString, { cwd: path.join(`.`, `dist`, `packages`, `${directory}`) });
};

const removeNonCorePackagesFromMainPackageJson = async () => {
    const packageJson: NormalizedReadResult | undefined = await readPkgUp({
        cwd: path.join(`.`, `dist`, `packages`, `omnihive`),
    });

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
            if (
                !IsHelper.isNullOrUndefined(packageJson) &&
                !IsHelper.isNullOrUndefined(packageJson.packageJson) &&
                !IsHelper.isNullOrUndefined(packageJson.packageJson.dependencies)
            ) {
                delete packageJson.packageJson.dependencies[loadedPackage[0]];
            }
        }
    }

    if (!IsHelper.isNullOrUndefined(packageJson) && !IsHelper.isNullOrUndefined(packageJson.packageJson)) {
        await writePkg(path.join(`.`, `dist`, `packages`, `omnihive`), packageJson.packageJson);
    }
};

const pushGithubChanges = () => {
    execa.commandSync(`git push --follow-tags origin main`, { cwd: path.join(`.`) });
};

const runVersioning = async (debug: boolean) => {
    if (debug) {
        console.log(execa.commandSync("yarn run release:dry-run", { cwd: path.join(`.`), shell: true }).stdout);
    } else {
        console.log(execa.commandSync("yarn run release", { cwd: path.join(`.`), shell: true }).stdout);
    }
};

const updateVersion = async () => {
    const packageJson: NormalizedReadResult | undefined = await readPkgUp({
        cwd: path.join(`.`, `dist`, `packages`, `omnihive`),
    });

    if (IsHelper.isNullOrUndefined(packageJson)) {
        throw new Error("Update version cannot find the main package.json");
    }

    const currentVersion: string = packageJson.packageJson.version;

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

// Master runner
build();
