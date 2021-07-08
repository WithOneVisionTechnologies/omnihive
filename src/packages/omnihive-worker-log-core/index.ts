/// <reference path="../../types/globals.omnihive.d.ts" />

import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { OmniHiveLogLevel } from "@withonevision/omnihive-core/enums/OmniHiveLogLevel";
import { ILogWorker } from "@withonevision/omnihive-core/interfaces/ILogWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import { RegisteredHiveWorker } from "@withonevision/omnihive-core/models/RegisteredHiveWorker";
import chalk from "chalk";
import dayjs from "dayjs";
import os from "os";
import { serializeError } from "serialize-error";
import { AdminEventType } from "@withonevision/omnihive-core/enums/AdminEventType";
import { AdminRoomType } from "@withonevision/omnihive-core/enums/AdminRoomType";

export default class LogWorkerServerDefault extends HiveWorkerBase implements ILogWorker {
    constructor() {
        super();
    }

    public write = async (logLevel: OmniHiveLogLevel, logString: string): Promise<void> => {
        const timestamp: string = dayjs().format("YYYY-MM-DD HH:mm:ss");
        const osName: string = os.hostname();

        global.omnihive.emitToNamespace(AdminRoomType.Log, AdminEventType.LogResponse, {
            logLevel,
            timestamp,
            osName,
            logString,
        });

        this.chalkConsole(logLevel, osName, timestamp, logString);

        const logWorkers: RegisteredHiveWorker[] = global.omnihive.registeredWorkers.filter(
            (value: RegisteredHiveWorker) => {
                return value.type === HiveWorkerType.Log && value.name !== "__ohBootLogWorker";
            }
        );

        logWorkers.forEach((value: RegisteredHiveWorker) => {
            try {
                (value.instance as ILogWorker).write(logLevel, logString);
            } catch (e) {
                this.chalkConsole(
                    OmniHiveLogLevel.Error,
                    osName,
                    timestamp,
                    `Skipping logging for ${value.name} due to error: ${serializeError(e)}`
                );
            }
        });
    };

    private chalkConsole = (logLevel: OmniHiveLogLevel, osName: string, timestamp: string, logString: string) => {
        switch (logLevel) {
            case OmniHiveLogLevel.Warn:
                console.log(chalk.yellow(`warn: ${timestamp} ${osName} ${logString}`));
                break;
            case OmniHiveLogLevel.Error:
                console.log(chalk.red(`error: ${timestamp} ${osName} ${logString}`));
                break;
            default:
                console.log(`${chalk.blueBright("info:")} ${chalk.magenta(`${timestamp} ${osName}`)} ${logString}`);
                break;
        }
    };
}
