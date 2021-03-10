/// <reference path="../../../types/globals.omnihive.d.ts" />

import { OmniHiveLogLevel } from "@withonevision/omnihive-core/enums/OmniHiveLogLevel";
import { StringHelper } from "@withonevision/omnihive-core/helpers/StringHelper";
import * as socketio from "socket.io";
import { LogService } from "./LogService";
import { ServerService } from "./ServerService";
import nodeCleanup from "node-cleanup";
import { ServerStatus } from "@withonevision/omnihive-core/enums/ServerStatus";
import { ServerSettings } from "src/packages/omnihive-core/models/ServerSettings";
import Conf from "conf";
import fse from "fs-extra";

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
            socket.on("config-request", (request: { adminPassword: string }) => {
                if (
                    !request ||
                    !request.adminPassword ||
                    StringHelper.isNullOrWhiteSpace(request.adminPassword) ||
                    request.adminPassword !== global.omnihive.serverSettings.config.adminPassword
                ) {
                    socket.emit("config-response", {
                        requestComplete: false,
                        requestError: "Invalid Password",
                        config: {},
                    });

                    return;
                }

                socket.emit("config-response", {
                    requestComplete: true,
                    requestError: "",
                    config: global.omnihive.serverSettings,
                });
            });

            socket.on("config-save-request", (request: { adminPassword: string; config: ServerSettings }) => {
                if (
                    !request ||
                    !request.adminPassword ||
                    StringHelper.isNullOrWhiteSpace(request.adminPassword) ||
                    request.adminPassword !== global.omnihive.serverSettings.config.adminPassword
                ) {
                    socket.emit("config-save-response", {
                        requestComplete: false,
                        requestError: "Invalid Password",
                        verified: false,
                    });

                    return;
                }

                try {
                    const config = new Conf();
                    const latestConf: string | undefined = config.get<string>("latest-settings") as string;
                    const settings: ServerSettings = request.config as ServerSettings;
                    fse.writeFileSync(latestConf, JSON.stringify(settings));

                    socket.emit("config-save-response", {
                        requestComplete: true,
                        requestError: "",
                        verified: true,
                    });
                } catch {
                    socket.emit("config-save-response", {
                        requestComplete: false,
                        requestError: "Invalid Password",
                        verified: false,
                    });

                    return;
                }
            });

            socket.on("refresh-request", (request: { adminPassword: string; refresh?: boolean }) => {
                if (
                    !request ||
                    !request.adminPassword ||
                    StringHelper.isNullOrWhiteSpace(request.adminPassword) ||
                    request.adminPassword !== global.omnihive.serverSettings.config.adminPassword ||
                    !request.refresh
                ) {
                    socket.emit("refresh-response", {
                        requestComplete: false,
                        requestError: "Invalid Password",
                        refresh: false,
                    });

                    return;
                }

                const serverService: ServerService = new ServerService();
                serverService.run(true);

                socket.emit("refresh-response", {
                    requestComplete: true,
                    requestError: "",
                    refresh: true,
                });
            });

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

        nodeCleanup(() => {
            global.omnihive.adminServer.sockets.emit("status-response", {
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
