import { ServerStatus } from "src/packages/omnihive-core/enums/ServerStatus";
import { RegisteredUrl } from "src/packages/omnihive-core/models/RegisteredUrl";
import express from "express";
import { Server } from "http";
import { ConnectionSchema } from "src/packages/omnihive-core/models/ConnectionSchema";
import { RegisteredHiveWorker } from "src/packages/omnihive-core/models/RegisteredHiveWorker";
import { ServerSettings } from "src/packages/omnihive-core/models/ServerSettings";
import { IHiveWorker } from "src/packages/omnihive-core/interfaces/IHiveWorker";
import { CommandLineArgs } from "src/packages/omnihive/models/CommandLineArgs";
import { BootLoaderSettings } from "src/packages/omnihive/models/BootLoaderSettings";
import { AdminRoomType } from "src/packages/omnihive-core/enums/AdminRoomType";
import { AdminEventType } from "src/packages/omnihive-core/enums/AdminEventType";
import socketio from "socket.io";

declare global {
    declare namespace NodeJS {
        interface Global {
            omnihive: {
                adminServer: socketio.Server | undefined;
                appServer: express.Express | undefined;
                bootLoaderSettings: BootLoaderSettings;
                bootWorkerNames: string[];
                commandLineArgs: CommandLineArgs;
                emitToCluster: (event: AdminEventType, message?: any) => Promise<void>;
                emitToNamespace: (room: AdminRoomType, event: AdminEventType, message?: any) => Promise<void>;
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
