/// <reference path="../../../types/globals.omnihive.d.ts" />

import { AdminEventType } from "@withonevision/omnihive-core/enums/AdminEventType";
import { AdminRoomType } from "@withonevision/omnihive-core/enums/AdminRoomType";
import { ServerStatus } from "@withonevision/omnihive-core/enums/ServerStatus";
import { AdminRequest } from "@withonevision/omnihive-core/models/AdminRequest";
import { AdminResponse } from "@withonevision/omnihive-core/models/AdminResponse";
import { ConnectionSchema } from "@withonevision/omnihive-core/models/ConnectionSchema";
import { HiveWorker } from "@withonevision/omnihive-core/models/HiveWorker";
import { RegisteredUrl } from "@withonevision/omnihive-core/models/RegisteredUrl";
import { WorkerSetterBase } from "@withonevision/omnihive-core/models/WorkerSetterBase";
import express from "express";
import fse from "fs-extra";
import { Server } from "http";
import path from "path";
import socketIo from "socket.io";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";
import { CommandLineArgs } from "./CommandLineArgs";

export class GlobalObject extends WorkerSetterBase {
    public adminServer: socketIo.Server | undefined = undefined;
    public appServer: express.Express | undefined = undefined;
    public commandLineArgs: CommandLineArgs = new CommandLineArgs();
    public ohDirName: string = "";
    public registeredSchemas: ConnectionSchema[] = [];
    public registeredUrls: RegisteredUrl[] = [];
    public serverError: any = {};
    public serverStatus: ServerStatus = ServerStatus.Unknown;
    public webServer: Server | undefined = undefined;

    public checkWorkerImportPath = (hiveWorker: HiveWorker) => {
        if (
            IsHelper.isNullOrUndefined(hiveWorker.importPath) ||
            IsHelper.isEmptyStringOrWhitespace(hiveWorker.importPath)
        ) {
            throw new Error(`Hive worker type ${hiveWorker.type} with name ${hiveWorker.name} has no import path`);
        }

        if (IsHelper.isEmptyStringOrWhitespace(hiveWorker.package)) {
            if (!IsHelper.isEmptyStringOrWhitespace(this.ohDirName)) {
                hiveWorker.importPath = path.join(this.ohDirName, hiveWorker.importPath);
            } else {
                hiveWorker.importPath = path.join(process.cwd(), hiveWorker.importPath);
            }
        }
    };

    public emitToCluster = async (event: AdminEventType, message?: any): Promise<void> => {
        if (IsHelper.isNullOrUndefined(this.adminServer)) {
            return;
        }

        const adminPassword = this.getEnvironmentVariable<string>("OH_ADMIN_PASSWORD");
        const serverGroupId = this.getEnvironmentVariable<string>("OH_ADMIN_SERVER_GROUP_ID");

        if (
            IsHelper.isNullOrUndefinedOrEmptyStringOrWhitespace(adminPassword) ||
            IsHelper.isNullOrUndefinedOrEmptyStringOrWhitespace(serverGroupId)
        ) {
            throw new Error("Admin password or server group ID is undefined");
        }

        const eventMessage: AdminRequest = {
            adminPassword,
            serverGroupId,
            data: message,
        };

        this.adminServer.emit(event, eventMessage);
    };

    public emitToNamespace = async (room: AdminRoomType, event: AdminEventType, message?: any): Promise<void> => {
        if (IsHelper.isNullOrUndefined(this.adminServer)) {
            return;
        }

        const serverGroupId = this.getEnvironmentVariable<string>("OH_ADMIN_SERVER_GROUP_ID");

        if (IsHelper.isNullOrUndefinedOrEmptyStringOrWhitespace(serverGroupId)) {
            throw new Error("Server group ID is undefined");
        }

        const eventMessage: AdminResponse = {
            serverGroupId,
            requestComplete: true,
            requestError: undefined,
            data: message,
        };

        this.adminServer
            .of(`/${this.getEnvironmentVariable<string>("OH_ADMIN_SERVER_GROUP_ID")}`)
            .to(`${this.getEnvironmentVariable<string>("OH_ADMIN_SERVER_GROUP_ID")}-${room}`)
            .emit(event, eventMessage);
    };

    public getFilePath = (filePath: string): string => {
        let finalPath: string = "";

        if (IsHelper.isNullOrUndefined(filePath) || IsHelper.isEmptyStringOrWhitespace(filePath)) {
            return finalPath;
        }

        if (fse.existsSync(filePath)) {
            finalPath = filePath;
        }

        if (IsHelper.isEmptyStringOrWhitespace(finalPath) && fse.existsSync(path.join(this.ohDirName, filePath))) {
            finalPath = path.join(this.ohDirName, filePath);
        }

        if (
            IsHelper.isEmptyStringOrWhitespace(finalPath) &&
            !IsHelper.isEmptyStringOrWhitespace(this.commandLineArgs.environmentFile) &&
            fse.existsSync(path.join(path.parse(this.commandLineArgs.environmentFile).dir, filePath))
        ) {
            finalPath = path.join(path.parse(this.commandLineArgs.environmentFile).dir, filePath);
        }

        return finalPath;
    };
}
