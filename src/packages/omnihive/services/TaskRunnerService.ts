/// <reference path="../../../types/globals.omnihive.d.ts" />

import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { OmniHiveLogLevel } from "@withonevision/omnihive-core/enums/OmniHiveLogLevel";
import { RegisteredHiveWorker } from "@withonevision/omnihive-core/models/RegisteredHiveWorker";
import chalk from "chalk";
import fse from "fs-extra";
import readPkgUp from "read-pkg-up";
import { serializeError } from "serialize-error";
import { AppService } from "./AppService";
import { LogService } from "./LogService";

export class TaskRunnerService {
    public run = async (worker: string, args: string): Promise<void> => {
        // Run basic app service
        const pkgJson: readPkgUp.NormalizedReadResult | undefined = await readPkgUp();
        const appService: AppService = new AppService();

        await appService.initOmniHiveApp(pkgJson);

        // Get TaskWorker

        const taskWorker: RegisteredHiveWorker | undefined = global.omnihive.registeredWorkers.find(
            (rw: RegisteredHiveWorker) =>
                rw.name === worker && rw.enabled === true && rw.type === HiveWorkerType.TaskFunction
        );

        if (!taskWorker) {
            this.logError(
                worker,
                new Error(
                    `Task Worker ${worker} was not found in server configuration, is disabled, or is not of the right type`
                )
            );
            return;
        }

        // Set up worker args
        let workerArgs: any = null;

        if (args && args !== "") {
            try {
                workerArgs = JSON.parse(fse.readFileSync(args, { encoding: "utf8" }));
            } catch (err) {
                this.logError(worker, err);
            }
        }

        // Try running the worker
        try {
            if (!(workerArgs === null || workerArgs === undefined)) {
                await taskWorker.instance.execute(workerArgs);
            } else {
                await taskWorker.instance.execute();
            }
        } catch (err) {
            this.logError(worker, err);
        }

        console.log(chalk.greenBright("Done with task runner..."));
        process.exit();
    };

    private logError = async (workerName: string, err: Error) => {
        const logService: LogService = new LogService();

        logService.write(
            OmniHiveLogLevel.Error,
            `Task Runner => ${workerName} => Error => ${JSON.stringify(serializeError(err))}`
        );

        throw new Error(`Task Runner => ${workerName} => Error => ${JSON.stringify(serializeError(err))}`);
    };
}
