import express from "express";
import { Server } from "http";
import socketio from "socket.io";
import { AdminEventType } from "src/packages/omnihive-core/enums/AdminEventType";
import { AdminRoomType } from "src/packages/omnihive-core/enums/AdminRoomType";
import { RegisteredHiveWorkerSection } from "src/packages/omnihive-core/enums/RegisteredHiveWorkerSection";
import { ServerStatus } from "src/packages/omnihive-core/enums/ServerStatus";
import { IHiveWorker } from "src/packages/omnihive-core/interfaces/IHiveWorker";
import { AppSettings } from "src/packages/omnihive-core/models/AppSettings";
import { ConnectionSchema } from "src/packages/omnihive-core/models/ConnectionSchema";
import { HiveWorker } from "src/packages/omnihive-core/models/HiveWorker";
import { RegisteredHiveWorker } from "src/packages/omnihive-core/models/RegisteredHiveWorker";
import { RegisteredUrl } from "src/packages/omnihive-core/models/RegisteredUrl";
import { CommandLineArgs } from "src/packages/omnihive/models/CommandLineArgs";

declare global {
    declare namespace NodeJS {
        interface Global {
            omnihive: {
                adminServer: socketio.Server | undefined;
                appServer: express.Express | undefined;
                appSettings: AppSettings;
                checkWorkerImportPath: (hiveWorker: HiveWorker) => void;
                commandLineArgs: CommandLineArgs;
                emitToCluster: (event: AdminEventType, message?: any) => Promise<void>;
                emitToNamespace: (room: AdminRoomType, event: AdminEventType, message?: any) => Promise<void>;
                getEnvironmentVariable: <T extends string | number | boolean>(name: string) => T | undefined;
                getFilePath: (filePath: string) => string;
                getWorker: <T extends IHiveWorker | undefined>(type: string, name?: string) => T | undefined;
                initWorkers: (appSettings: AppSettings) => Promise<void>;
                ohDirName: string;
                pushWorker: (hiveWorker: HiveWorker, section?: RegisteredHiveWorkerSection) => Promise<void>;
                registeredSchemas: ConnectionSchema[];
                registeredUrls: RegisteredUrl[];
                registeredWorkers: RegisteredHiveWorker[];
                serverError: any;
                serverStatus: ServerStatus;
                webServer: Server | undefined;
            };
        }
    }
}
