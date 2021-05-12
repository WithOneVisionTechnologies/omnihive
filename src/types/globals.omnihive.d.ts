import { ServerStatus } from "src/packages/omnihive-core/enums/ServerStatus";
import { RegisteredUrl } from "src/packages/omnihive-core/models/RegisteredUrl";
import express from "express";
import { Server } from "http";
import { ConnectionSchema } from "src/packages/omnihive-core/models/ConnectionSchema";
import { RegisteredHiveWorker } from "src/packages/omnihive-core/models/RegisteredHiveWorker";
import { ServerSettings } from "src/packages/omnihive-core/models/ServerSettings";
import { IHiveWorker } from "src/packages/omnihive-core/interfaces/IHiveWorker";
import WebSocket from "ws";
import { CommandLineArgs } from "src/packages/omnihive/models/CommandLineArgs";

declare global {
    declare namespace NodeJS {
        interface Global {
            omnihive: {
                adminServer: WebSocket.Server;
                adminServerTimer: NodeJS.Timer;
                appServer: express.Express | undefined;
                bootWorkerNames: string[];
                commandLineArgs: CommandLineArgs;
                getWorker: <T extends IHiveWorker | undefined>(type: string, name?: string) => T | undefined;
                initWorkers: (configs: HiveWorker[]) => Promise<void>;
                ohDirName: string;
                pushWorker: (hiveWorker: HiveWorker, isBoot: boolean = false, isCore: boolean = false) => Promise<void>;
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
