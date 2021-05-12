import { ServerStatus } from "@withonevision/omnihive-core/enums/ServerStatus";
import { RegisteredUrl } from "@withonevision/omnihive-core/models/RegisteredUrl";
import express from "express";
import { Server } from "http";
import { ConnectionSchema } from "@withonevision/omnihive-core/models/ConnectionSchema";
import { RegisteredHiveWorker } from "@withonevision/omnihive-core/models/RegisteredHiveWorker";
import { ServerSettings } from "@withonevision/omnihive-core/models/ServerSettings";
import { IHiveWorker } from "@withonevision/omnihive-core/interfaces/IHiveWorker";
import WebSocket from "ws";
import { CommandLineArguments } from "src/packages/omnihive/models/CommandLineArguments";

declare global {
    declare namespace NodeJS {
        interface Global {
            omnihive: {
                adminServer: WebSocket.Server;
                adminServerTimer: NodeJS.Timer;
                appServer: express.Express | undefined;
                bootWorkerNames: string[];
                commandLineArgs: CommandLineArguments;
                getWorker: <T extends IHiveWorker | undefined>(type: string, name?: string) => T | undefined;
                initWorkers: (configs: HiveWorker[]) => Promise<void>;
                instanceName: string;
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
