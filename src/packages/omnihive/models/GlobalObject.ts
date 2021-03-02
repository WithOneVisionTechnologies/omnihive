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
import * as socketio from "socket.io";

export class GlobalObject extends WorkerSetterBase {
    public adminServer: socketio.Server = new socketio.Server();
    public appServer: express.Express | undefined = undefined;
    public ohDirName: string = "";
    public registeredSchemas: ConnectionSchema[] = [];
    public registeredUrls: RegisteredUrl[] = [];
    public serverError: any = {};
    public serverStatus: ServerStatus = ServerStatus.Unknown;
    public webServer: Server | undefined = undefined;

    public async pushWorker(hiveWorker: HiveWorker): Promise<void> {
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

        const newWorker: any = await AwaitHelper.execute<any>(import(hiveWorker.importPath));
        const newWorkerInstance: any = new newWorker.default();
        await AwaitHelper.execute<void>((newWorkerInstance as IHiveWorker).init(hiveWorker));

        const registeredWorker: RegisteredHiveWorker = { ...hiveWorker, instance: newWorkerInstance };
        this.registeredWorkers.push(registeredWorker);
    }
}
