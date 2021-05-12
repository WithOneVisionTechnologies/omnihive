/// <reference path="../../../types/globals.omnihive.d.ts" />

import { ServerStatus } from "@withonevision/omnihive-core/enums/ServerStatus";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { StringHelper } from "@withonevision/omnihive-core/helpers/StringHelper";
import { IHiveWorker } from "@withonevision/omnihive-core/interfaces/IHiveWorker";
import { ConnectionSchema } from "@withonevision/omnihive-core/models/ConnectionSchema";
import { HiveWorker } from "@withonevision/omnihive-core/models/HiveWorker";
import { RegisteredHiveWorker } from "@withonevision/omnihive-core/models/RegisteredHiveWorker";
import { RegisteredUrl } from "@withonevision/omnihive-core/models/RegisteredUrl";
import { WorkerSetterBase } from "@withonevision/omnihive-core/models/WorkerSetterBase";
import express from "express";
import { Server } from "http";
import path from "path";
import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { OmniHiveLogLevel } from "@withonevision/omnihive-core/enums/OmniHiveLogLevel";
import { ILogWorker } from "@withonevision/omnihive-core/interfaces/ILogWorker";
import WebSocket from "ws";
import { CommandLineArguments } from "./CommandLineArguments";
import importFresh from "import-fresh";

export class GlobalObject extends WorkerSetterBase {
    public adminServer!: WebSocket.Server;
    public adminServerTimer!: NodeJS.Timer;
    public appServer: express.Express | undefined = undefined;
    public bootWorkerNames: string[] = [];
    public commandLineArgs: CommandLineArguments = new CommandLineArguments();
    public instanceName: string = "default";
    public ohDirName: string = "";
    public registeredSchemas: ConnectionSchema[] = [];
    public registeredUrls: RegisteredUrl[] = [];
    public serverError: any = {};
    public serverStatus: ServerStatus = ServerStatus.Unknown;
    public webServer: Server | undefined = undefined;

    public async pushWorker(hiveWorker: HiveWorker, isBoot: boolean = false, isCore: boolean = false): Promise<void> {
        const logWorker: ILogWorker | undefined = this.getWorker(HiveWorkerType.Log);

        if (!hiveWorker.enabled) {
            return;
        }

        if (
            this.registeredWorkers?.find((value: RegisteredHiveWorker) => {
                return value.name === hiveWorker.name;
            })
        ) {
            return;
        }

        if (!hiveWorker.importPath || hiveWorker.importPath === "") {
            throw new Error(`Hive worker type ${hiveWorker.type} with name ${hiveWorker.name} has no import path`);
        }

        if (hiveWorker.package === "") {
            if (!StringHelper.isNullOrWhiteSpace(this.ohDirName)) {
                hiveWorker.importPath = path.join(this.ohDirName, hiveWorker.importPath);
            } else {
                hiveWorker.importPath = path.join(process.cwd(), hiveWorker.importPath);
            }
        }

        let registerWorker: boolean = true;

        Object.keys(hiveWorker.metadata).forEach((metaKey: string) => {
            if (typeof hiveWorker.metadata[metaKey] === "string") {
                if (
                    (hiveWorker.metadata[metaKey] as string).startsWith("${") &&
                    (hiveWorker.metadata[metaKey] as string).endsWith("}")
                ) {
                    let metaValue: string = hiveWorker.metadata[metaKey] as string;

                    metaValue = metaValue.substr(2, metaValue.length - 3);
                    const envValue: unknown | undefined = global.omnihive.serverSettings.constants[metaValue];

                    if (envValue) {
                        hiveWorker.metadata[metaKey] = envValue;
                    } else {
                        registerWorker = false;
                        logWorker?.write(
                            OmniHiveLogLevel.Warn,
                            `Cannot register ${hiveWorker.name}...missing ${metaKey} in constants`
                        );
                    }
                }
            }
        });

        if (registerWorker) {
            const newWorker: any = importFresh(hiveWorker.importPath);
            const newWorkerInstance: any = new newWorker.default();
            await AwaitHelper.execute<void>((newWorkerInstance as IHiveWorker).init(hiveWorker));

            const registeredWorker: RegisteredHiveWorker = {
                ...hiveWorker,
                instance: newWorkerInstance,
                isCore,
                isBoot,
            };
            this.registeredWorkers.push(registeredWorker);
        }
    }
}
