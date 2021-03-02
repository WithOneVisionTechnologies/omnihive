import { ServerStatus } from "@withonevision/omnihive-core/enums/ServerStatus";
import { RegisteredUrl } from "@withonevision/omnihive-core/models/RegisteredUrl";
import express from "express";
import { Server } from "http";
import { ConnectionSchema } from "@withonevision/omnihive-core/models/ConnectionSchema";
import { RegisteredHiveWorker } from "@withonevision/omnihive-core/models/RegisteredHiveWorker";
import { ServerSettings } from "@withonevision/omnihive-core/models/ServerSettings";
import { IHiveWorker } from "@withonevision/omnihive-core/interfaces/IHiveWorker";
import * as socketio from "socket.io";

declare global {
    declare namespace NodeJS {
        interface Global {
            omnihive: {
                adminServer: socketio.Server;
                appServer: express.Express | undefined;
                getWorker: <T extends IHiveWorker | undefined>(type: string, name?: string) => T | undefined;
                initWorkers: (configs: HiveWorker[]) => Promise<void>;
                ohDirName: string;
                pushWorker: (hiveWorker: HiveWorker, runAfterInit: boolean = true) => Promise<void>;
                registeredSchemas: ConnectionSchema[];
                registeredUrls: RegisteredUrl[];
                registeredWorkers: RegisteredHiveWorker[];
                serverError: any;
                serverSettings: ServerSettings;
                serverStatus: ServerStatus;
                webServer: Server | undefined;
            };
        }
    }
}
