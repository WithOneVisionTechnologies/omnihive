/// <reference path="../../../types/globals.omnihive.d.ts" />

import { createAdapter } from "@socket.io/redis-adapter";
import { Emitter } from "@socket.io/redis-emitter";
import { AdminEventType } from "@withonevision/omnihive-core/enums/AdminEventType";
import { AdminRoomType } from "@withonevision/omnihive-core/enums/AdminRoomType";
import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { OmniHiveLogLevel } from "@withonevision/omnihive-core/enums/OmniHiveLogLevel";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";
import { ObjectHelper } from "@withonevision/omnihive-core/helpers/ObjectHelper";
import { IConfigWorker } from "@withonevision/omnihive-core/interfaces/IConfigWorker";
import { ILogWorker } from "@withonevision/omnihive-core/interfaces/ILogWorker";
import { ITokenWorker } from "@withonevision/omnihive-core/interfaces/ITokenWorker";
import { AdminRequest } from "@withonevision/omnihive-core/models/AdminRequest";
import { AdminResponse } from "@withonevision/omnihive-core/models/AdminResponse";
import { ServerConfig } from "@withonevision/omnihive-core/models/ServerConfig";
import { EnvironmentVariable } from "@withonevision/omnihive-core/models/EnvironmentVariable";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import next from "next";
import ipc from "node-ipc";
import redis from "redis";
import * as socketio from "socket.io";
import { v4 as uuidv4 } from "uuid";

let ipcId: string = uuidv4();
ipc.config.id = ipcId;
ipc.config.retry = 1000;
ipc.config.sync = true;

export class AdminService {
    private logWorker!: ILogWorker | undefined;
    private ioEmitter!: Emitter | undefined;

    private adminSocketPortNumber =
        global.omnihive.getEnvironmentVariable<number>("OH_ADMIN_SOCKET_PORT_NUMBER") ?? 7205;
    private adminWebPortNumber = global.omnihive.getEnvironmentVariable<number>("OH_ADMIN_WEB_PORT_NUMBER") ?? 7206;
    private clusterConnectionString = global.omnihive.getEnvironmentVariable<string>(
        "OH_CLUSTER_REDIS_CONNECTION_STRING"
    );
    private clusterEnabled = global.omnihive.getEnvironmentVariable<boolean>("OH_CLUSTER_ENABLE") ?? false;
    private productionMode = global.omnihive.getEnvironmentVariable<boolean>("OH_PRODUCTION_MODE") ?? true;
    private serverGroupId = global.omnihive.getEnvironmentVariable<string>("OH_ADMIN_SERVER_GROUP_ID") ?? "";

    public run = async () => {
        if (
            IsHelper.isNullOrUndefinedOrEmptyStringOrWhitespace(this.serverGroupId) ||
            IsHelper.isNullOrUndefined(this.adminSocketPortNumber) ||
            IsHelper.isNullOrUndefined(this.adminWebPortNumber)
        ) {
            throw new Error("Server group ID or admin ports are undefined");
        }

        // Initiate log worker
        this.logWorker = global.omnihive.getWorker<ILogWorker>(HiveWorkerType.Log, "__ohBootLogWorker");

        // Setup Socket Server

        this.logWorker?.write(
            OmniHiveLogLevel.Info,
            `Setting up admin socket server on port ${this.adminSocketPortNumber}...`
        );

        if (!IsHelper.isNullOrUndefined(global.omnihive.adminServer)) {
            global.omnihive.adminServer.of(`/${this.serverGroupId}`).disconnectSockets(true);
            global.omnihive.adminServer.close();
        }

        global.omnihive.adminServer = new socketio.Server(this.adminSocketPortNumber, {
            cors: {
                origin: "*",
                methods: "*",
            },
        });

        const namespace: socketio.Namespace = global.omnihive.adminServer.of(this.serverGroupId);

        // Enable Redis if necessary
        if (this.clusterEnabled && !IsHelper.isNullOrUndefined(this.clusterConnectionString)) {
            const pubClient = redis.createClient(this.clusterConnectionString);
            const subClient = pubClient.duplicate();
            const emitClient = pubClient.duplicate();

            global.omnihive.adminServer.adapter(createAdapter(pubClient, subClient));
            this.ioEmitter = new Emitter(emitClient);
        }

        // Admin Event : Server Reset
        global.omnihive.adminServer.on(AdminEventType.ServerResetRequest, (message: AdminRequest) => {
            if (!this.checkRequest(AdminEventType.ServerResetRequest, message)) {
                return;
            }

            this.logWorker?.write(OmniHiveLogLevel.Info, "OmniHive Server Restarting...");

            setTimeout(() => {
                ipc.connectTo(global.omnihive.commandLineArgs.ipcServerId, () => {
                    ipc.of[global.omnihive.commandLineArgs.ipcServerId].on("connect", () => {
                        ipc.of[global.omnihive.commandLineArgs.ipcServerId].emit("omnihive.reboot");
                    });
                });
            }, 2000);
        });

        // Admin Event : Connection
        namespace.on(AdminEventType.Connection, (socket: socketio.Socket) => {
            socket.join(`${this.serverGroupId}-${AdminRoomType.Command}`);

            // Socket disconnect clear memory
            socket.on(AdminEventType.Disconnect, () => {
                socket.removeAllListeners();
                global.omnihive.adminServer?.of(this.serverGroupId).sockets.forEach((sck: socketio.Socket) => {
                    if (socket.id === sck.id) sck.disconnect(true);
                });
            });

            // Admin Event : Access Token
            socket.on(AdminEventType.AccessTokenRequest, (message: AdminRequest) => {
                if (!this.checkRequest(AdminEventType.AccessTokenRequest, message, socket)) {
                    return;
                }

                const tokenWorker: ITokenWorker | undefined = global.omnihive.getWorker<ITokenWorker | undefined>(
                    HiveWorkerType.Token
                );

                if (IsHelper.isNullOrUndefined(tokenWorker)) {
                    this.sendSuccessToSocket(AdminEventType.AccessTokenRequest, socket, {
                        hasWorker: false,
                        token: "",
                    });

                    return;
                }

                tokenWorker.get().then((token: string) => {
                    this.sendSuccessToSocket(AdminEventType.AccessTokenRequest, socket, {
                        hasWorker: true,
                        token,
                    });
                });
            });

            // Admin Event : Config
            socket.on(AdminEventType.ConfigRequest, async (message: AdminRequest) => {
                if (!this.checkRequest(AdminEventType.ConfigRequest, message, socket)) {
                    return;
                }

                let serverConfig: ServerConfig = new ServerConfig();

                const configWorker: IConfigWorker | undefined = global.omnihive.getWorker<IConfigWorker>(
                    HiveWorkerType.Config
                );

                if (IsHelper.isNullOrUndefined(configWorker)) {
                    this.sendErrorToSocket(AdminEventType.ConfigSaveRequest, socket, "No valid config worker found");
                    return;
                }

                serverConfig = await AwaitHelper.execute(configWorker.get());

                this.sendSuccessToSocket(AdminEventType.ConfigRequest, socket, {
                    config: serverConfig,
                    systemEnvironmentVariables: global.omnihive.serverConfig.environmentVariables.filter(
                        (variable: EnvironmentVariable) => variable.isSystem
                    ),
                });
            });

            // Admin Event : Config Save
            socket.on(AdminEventType.ConfigSaveRequest, async (message: AdminRequest<{ config: ServerConfig }>) => {
                if (!this.checkRequest(AdminEventType.ConfigSaveRequest, message, socket)) {
                    return;
                }

                try {
                    if (IsHelper.isNullOrUndefined(message.data) || IsHelper.isNullOrUndefined(message.data.config)) {
                        this.sendErrorToSocket(
                            AdminEventType.ConfigSaveRequest,
                            socket,
                            "Invalid Configuration Submitted"
                        );
                    }

                    const settings: ServerConfig = ObjectHelper.createStrict<ServerConfig>(
                        ServerConfig,
                        message.data?.config
                    );

                    const configWorker: IConfigWorker | undefined = global.omnihive.getWorker<IConfigWorker>(
                        HiveWorkerType.Config
                    );

                    if (IsHelper.isNullOrUndefined(configWorker)) {
                        throw new Error("No config worker detected on server");
                    }

                    await configWorker.set(settings);

                    this.sendSuccessToSocket(AdminEventType.ConfigSaveRequest, socket, {
                        verified: true,
                    });
                } catch (e) {
                    this.sendErrorToSocket(AdminEventType.ConfigSaveRequest, socket, e);
                    return;
                }
            });

            // Admin Event : Server Register
            socket.on(AdminEventType.RegisterRequest, (message: AdminRequest) => {
                if (!this.checkRequest(AdminEventType.RegisterRequest, message, socket)) {
                    return;
                }

                this.sendSuccessToSocket(AdminEventType.RegisterRequest, socket, { verified: true });
            });

            // Admin Event : Server Reset : Namespace
            socket.on(AdminEventType.ServerResetRequest, (message: AdminRequest) => {
                if (!this.checkRequest(AdminEventType.ServerResetRequest, message, socket)) {
                    return;
                }

                this.sendSuccessToSocket(AdminEventType.ServerResetRequest, socket, { verified: true });
                this.logWorker?.write(OmniHiveLogLevel.Info, "Broadcasting Restart...");

                setTimeout(() => {
                    if (!IsHelper.isNullOrUndefined(this.ioEmitter) && this.clusterEnabled) {
                        this.ioEmitter.serverSideEmit(AdminEventType.ServerResetRequest, message);
                        return;
                    }

                    ipc.connectTo(global.omnihive.commandLineArgs.ipcServerId, () => {
                        ipc.of[global.omnihive.commandLineArgs.ipcServerId].on("connect", () => {
                            ipc.of[global.omnihive.commandLineArgs.ipcServerId].emit("omnihive.reboot");
                        });
                    });
                }, 2000);
            });

            // Admin Event : Status
            socket.on(AdminEventType.StatusRequest, (message: AdminRequest) => {
                if (!this.checkRequest(AdminEventType.StatusRequest, message, socket)) {
                    return;
                }

                this.sendSuccessToSocket(AdminEventType.StatusRequest, socket, {
                    serverStatus: global.omnihive.serverStatus,
                    serverError: global.omnihive.serverError,
                });
            });

            // Admin Event : Start Log
            socket.on(AdminEventType.StartLogRequest, (message: AdminRequest) => {
                if (!this.checkRequest(AdminEventType.StartLogRequest, message, socket)) {
                    return;
                }

                socket.join(`${this.serverGroupId}-${AdminRoomType.Log}`);
                this.sendSuccessToSocket(AdminEventType.StartLogRequest, socket, { verified: true });
            });

            // Admin Event : Stop Log
            socket.on(AdminEventType.StopLogRequest, (message: AdminRequest) => {
                if (!this.checkRequest(AdminEventType.StopLogRequest, message, socket)) {
                    return;
                }

                socket.leave(`${this.serverGroupId}-${AdminRoomType.Log}`);
                this.sendSuccessToSocket(AdminEventType.StopLogRequest, socket, { verified: true });
            });

            // Admin Event : URL Request
            socket.on(AdminEventType.UrlListRequest, (message: AdminRequest) => {
                if (!this.checkRequest(AdminEventType.UrlListRequest, message, socket)) {
                    return;
                }

                this.sendSuccessToSocket(AdminEventType.UrlListRequest, socket, {
                    urls: global.omnihive.registeredUrls,
                });
            });
        });

        this.logWorker?.write(
            OmniHiveLogLevel.Info,
            `Admin socket server listening on port ${this.adminSocketPortNumber}...`
        );

        // Setup Web Server

        let adminServerPreparing: boolean = true;
        const adminWeb = express();

        adminWeb.use(helmet.dnsPrefetchControl());
        adminWeb.use(helmet.expectCt());
        adminWeb.use(helmet.frameguard());
        adminWeb.use(helmet.hidePoweredBy());
        adminWeb.use(helmet.hsts());
        adminWeb.use(helmet.ieNoOpen());
        adminWeb.use(helmet.noSniff());
        adminWeb.use(helmet.permittedCrossDomainPolicies());
        adminWeb.use(helmet.referrerPolicy());
        adminWeb.use(helmet.xssFilter());

        adminWeb.use(express.urlencoded({ extended: true }));
        adminWeb.use(express.json());
        adminWeb.use(cors());

        const nextServer = next({ dev: !this.productionMode });
        const handle = nextServer.getRequestHandler();
        nextServer.prepare().then(() => {
            adminServerPreparing = false;
        });

        adminWeb.all("*", (req: express.Request, res: express.Response) => {
            if (adminServerPreparing) {
                return res.status(200).json({ status: "OmniHive Admin Loading..." });
            }
            return handle(req, res);
        });

        adminWeb.listen(this.adminWebPortNumber, (err?: any) => {
            if (err) throw err;
            this.logWorker?.write(
                OmniHiveLogLevel.Info,
                `Admin web server listening on port ${this.adminWebPortNumber}...`
            );
        });
    };

    private checkRequest = (adminEvent: AdminEventType, request: AdminRequest, socket?: socketio.Socket): boolean => {
        if (
            IsHelper.isEmptyStringOrWhitespace(request.serverGroupId) ||
            request.serverGroupId !== global.omnihive.getEnvironmentVariable<string>("OH_ADMIN_SERVER_GROUP_ID")
        ) {
            return false;
        }

        if (
            !IsHelper.isEmptyStringOrWhitespace(request.adminPassword) &&
            !IsHelper.isEmptyStringOrWhitespace(request.serverGroupId) &&
            request.adminPassword === global.omnihive.getEnvironmentVariable<string>("OH_ADMIN_PASSWORD") &&
            request.serverGroupId === global.omnihive.getEnvironmentVariable<string>("OH_ADMIN_SERVER_GROUP_ID")
        ) {
            return true;
        }

        this.logWorker?.write(
            OmniHiveLogLevel.Warn,
            `Admin client register error using password ${request.adminPassword}...`
        );

        if (!IsHelper.isNullOrUndefined(socket)) {
            this.sendErrorToSocket(adminEvent, socket, "Invalid Admin Password");
        }

        return false;
    };

    private getResponseEventNameFromRequest = (adminEvent: AdminEventType): AdminEventType => {
        switch (adminEvent) {
            case AdminEventType.AccessTokenRequest:
                return AdminEventType.AccessTokenResponse;
            case AdminEventType.ConfigRequest:
                return AdminEventType.ConfigResponse;
            case AdminEventType.ConfigSaveRequest:
                return AdminEventType.ConfigSaveResponse;
            case AdminEventType.RegisterRequest:
                return AdminEventType.RegisterResponse;
            case AdminEventType.ServerResetRequest:
                return AdminEventType.ServerResetResponse;
            case AdminEventType.StartLogRequest:
                return AdminEventType.StartLogResponse;
            case AdminEventType.StatusRequest:
                return AdminEventType.StatusResponse;
            case AdminEventType.StopLogRequest:
                return AdminEventType.StopLogResponse;
            case AdminEventType.UrlListRequest:
                return AdminEventType.UrlListResponse;
            default:
                return AdminEventType.UnknownResponse;
        }
    };

    private sendErrorToSocket = (adminEvent: AdminEventType, socket: socketio.Socket, errorMessage: string): void => {
        const serverGroupId = global.omnihive.getEnvironmentVariable<string>("OH_ADMIN_SERVER_GROUP_ID");

        if (IsHelper.isNullOrUndefined(serverGroupId)) {
            throw new Error("Server group ID is undefined");
        }

        const adminResponse: AdminResponse = {
            serverGroupId,
            requestComplete: false,
            requestError: errorMessage,
        };

        socket.emit(this.getResponseEventNameFromRequest(adminEvent), adminResponse);
    };

    private sendSuccessToSocket = (adminEvent: AdminEventType, socket: socketio.Socket, message: any): void => {
        const serverGroupId = global.omnihive.getEnvironmentVariable<string>("OH_ADMIN_SERVER_GROUP_ID");

        if (IsHelper.isNullOrUndefined(serverGroupId)) {
            throw new Error("Server group ID is undefined");
        }

        const adminResponse: AdminResponse = {
            serverGroupId,
            requestComplete: true,
            requestError: undefined,
            data: message,
        };

        socket.emit(this.getResponseEventNameFromRequest(adminEvent), adminResponse);
    };
}
