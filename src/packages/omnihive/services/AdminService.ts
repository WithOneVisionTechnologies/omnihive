/// <reference path="../../../types/globals.omnihive.d.ts" />

import { OmniHiveLogLevel } from "@withonevision/omnihive-core/enums/OmniHiveLogLevel";
import { StringHelper } from "@withonevision/omnihive-core/helpers/StringHelper";
import * as socketio from "socket.io";
import { LogService } from "./LogService";
import { ServerService } from "./ServerService";
import nodeCleanup from "node-cleanup";
import { ServerStatus } from "@withonevision/omnihive-core/enums/ServerStatus";

export class AdminService {
    public run = async () => {
        const logService: LogService = new LogService();

        logService.write(
            OmniHiveLogLevel.Info,
            `Setting up admin server on port ${global.omnihive.serverSettings.config.adminPortNumber}...`
        );

        global.omnihive.adminServer.listen(global.omnihive.serverSettings.config.adminPortNumber, {
            cors: { origin: "*" },
        });

        global.omnihive.adminServer.on("connection", (socket: socketio.Socket) => {
            socket.on("register-request", (request: { adminPassword: string }) => {
                if (
                    !request ||
                    !request.adminPassword ||
                    StringHelper.isNullOrWhiteSpace(request.adminPassword) ||
                    request.adminPassword !== global.omnihive.serverSettings.config.adminPassword
                ) {
                    logService.write(
                        OmniHiveLogLevel.Warn,
                        `Admin client register error from ${socket.handshake.address} using password ${request.adminPassword}...`
                    );

                    socket.emit("register-response", {
                        requestComplete: false,
                        requestError: "Invalid Password",
                        verified: false,
                    });

                    return;
                }

                socket.emit("register-response", {
                    requestComplete: true,
                    requestError: "",
                    verified: true,
                });
            });

            socket.on("status-request", (request: { adminPassword: string }) => {
                if (
                    !request ||
                    !request.adminPassword ||
                    StringHelper.isNullOrWhiteSpace(request.adminPassword) ||
                    request.adminPassword !== global.omnihive.serverSettings.config.adminPassword
                ) {
                    socket.emit("status-response", {
                        requestComplete: false,
                        requestError: "Invalid Password",
                        serverStatus: global.omnihive.serverStatus,
                        serverError: global.omnihive.serverError,
                    });

                    return;
                }

                socket.emit("status-response", {
                    requestComplete: true,
                    requestError: "",
                    serverStatus: global.omnihive.serverStatus,
                    serverError: global.omnihive.serverError,
                });
            });

            socket.on("urls-request", (request: { adminPassword: string }) => {
                if (
                    !request ||
                    !request.adminPassword ||
                    StringHelper.isNullOrWhiteSpace(request.adminPassword) ||
                    request.adminPassword !== global.omnihive.serverSettings.config.adminPassword
                ) {
                    socket.emit("urls-response", {
                        requestComplete: false,
                        requestError: "Invalid Password",
                        urls: [],
                    });

                    return;
                }

                socket.emit("urls-response", {
                    requestComplete: true,
                    requestError: "",
                    urls: global.omnihive.registeredUrls,
                });
            });
        });

        global.omnihive.adminServer.on("refresh-request", (request: { adminPassword: string; refresh?: boolean }) => {
            if (
                !request ||
                !request.adminPassword ||
                StringHelper.isNullOrWhiteSpace(request.adminPassword) ||
                request.adminPassword !== global.omnihive.serverSettings.config.adminPassword ||
                !request.refresh
            ) {
                return;
            }

            const serverService: ServerService = new ServerService();
            serverService.run(true);
        });

        nodeCleanup(() => {
            global.omnihive.adminServer.emit("status-response", {
                requestComplete: true,
                requestError: "",
                serverStatus: ServerStatus.Offline,
                serverError: undefined,
            });
        });

        logService.write(
            OmniHiveLogLevel.Info,
            `Admin server listening on port ${global.omnihive.serverSettings.config.adminPortNumber}...`
        );
    };
}
