/// <reference path="../../../types/globals.omnihive.d.ts" />

import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { OmniHiveLogLevel } from "@withonevision/omnihive-core/enums/OmniHiveLogLevel";
import { RegisteredUrlType } from "@withonevision/omnihive-core/enums/RegisteredUrlType";
import { ServerStatus } from "@withonevision/omnihive-core/enums/ServerStatus";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { ObjectHelper } from "@withonevision/omnihive-core/helpers/ObjectHelper";
import { ILogWorker } from "@withonevision/omnihive-core/interfaces/ILogWorker";
import { IRestEndpointWorker } from "@withonevision/omnihive-core/interfaces/IRestEndpointWorker";
import { IServerWorker } from "@withonevision/omnihive-core/interfaces/IServerWorker";
import { HiveWorkerMetadataRestFunction } from "@withonevision/omnihive-core/models/HiveWorkerMetadataRestFunction";
import { RegisteredHiveWorker } from "@withonevision/omnihive-core/models/RegisteredHiveWorker";
import { RestEndpointExecuteResponse } from "@withonevision/omnihive-core/models/RestEndpointExecuteResponse";
import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import http, { Server } from "http";
import path from "path";
import readPkgUp, { NormalizedReadResult } from "read-pkg-up";
import { serializeError } from "serialize-error";
import { IConfigWorker } from "@withonevision/omnihive-core/interfaces/IConfigWorker";
import swaggerUi from "swagger-ui-express";
import { AdminService } from "./AdminService";
import { AppService } from "./AppService";

export class ServerService {
    public run = async (serverReset: boolean = false): Promise<void> => {
        const appService: AppService = new AppService();
        const logWorker: ILogWorker | undefined = global.omnihive.getWorker<ILogWorker>(
            HiveWorkerType.Log,
            "ohBootLogWorker"
        );

        try {
            // Set server to rebuilding first
            await AwaitHelper.execute(this.changeServerStatus(ServerStatus.Rebuilding));

            // Check for server reset and re-poll settings in case they have changed
            if (serverReset === true) {
                const configWorker: IConfigWorker | undefined = global.omnihive.getWorker<IConfigWorker>(
                    HiveWorkerType.Config
                );

                if (!configWorker) {
                    throw new Error("No config worker can be found.  OmniHive cannot load.");
                }

                global.omnihive.serverSettings = await AwaitHelper.execute(configWorker.get());
            }

            const pkgJson: NormalizedReadResult | undefined = await AwaitHelper.execute(readPkgUp());

            await AwaitHelper.execute(appService.initOmniHiveApp(pkgJson));

            // Try to spin up full server
            let app: express.Express = await AwaitHelper.execute(this.getCleanAppServer());

            const servers: RegisteredHiveWorker[] = global.omnihive.registeredWorkers.filter(
                (rw: RegisteredHiveWorker) => rw.type === HiveWorkerType.Server && rw.enabled === true
            );

            for (const server of servers) {
                try {
                    app = await AwaitHelper.execute((server.instance as IServerWorker).buildServer(app));
                } catch (e) {
                    logWorker?.write(
                        OmniHiveLogLevel.Error,
                        `Skipping server worker ${server.name} due to error: ${serializeError(e)}`
                    );
                }
            }

            app.get("/", (_req, res) => {
                res.status(200).render("index", {
                    rootUrl: global.omnihive.serverSettings.config.webRootUrl,
                    registeredUrls: global.omnihive.registeredUrls,
                    status: global.omnihive.serverStatus,
                    error: global.omnihive.serverError,
                });
            });

            app.use((_req, res) => {
                return res.status(404).render("404", { rootUrl: global.omnihive.serverSettings.config.webRootUrl });
            });

            app.use((err: any, _req: any, res: any, _next: any) => {
                return res.status(500).render("500", {
                    rootUrl: global.omnihive.serverSettings.config.webRootUrl,
                    registeredUrls: global.omnihive.registeredUrls,
                    status: global.omnihive.serverStatus,
                    error: serializeError(err),
                });
            });

            global.omnihive.appServer = app;
            await AwaitHelper.execute(this.changeServerStatus(ServerStatus.Online));
        } catch (err) {
            // Problem...spin up admin server
            await AwaitHelper.execute(this.changeServerStatus(ServerStatus.Admin, err));
            logWorker?.write(OmniHiveLogLevel.Error, `Server Spin-Up Error => ${JSON.stringify(serializeError(err))}`);
        }
    };

    public changeServerStatus = async (serverStatus: ServerStatus, error?: Error): Promise<void> => {
        const adminService: AdminService = new AdminService();

        const logWorker: ILogWorker | undefined = global.omnihive.getWorker<ILogWorker>(
            HiveWorkerType.Log,
            "ohBootLogWorker"
        );

        logWorker?.write(OmniHiveLogLevel.Info, `Server Change Handler Started`);

        global.omnihive.serverStatus = serverStatus;

        if (error) {
            global.omnihive.serverError = serializeError(error);
        } else {
            global.omnihive.serverError = {};
        }

        if (serverStatus === ServerStatus.Admin || serverStatus === ServerStatus.Rebuilding) {
            const app: express.Express = await AwaitHelper.execute(this.getCleanAppServer());

            app.get("/", (_req, res) => {
                return res.status(200).render("index", {
                    rootUrl: global.omnihive.serverSettings.config.webRootUrl,
                    registeredUrls: global.omnihive.registeredUrls,
                    status: global.omnihive.serverStatus,
                    error: global.omnihive.serverError,
                });
            });

            app.use((_req, res) => {
                return res.status(404).render("404", { rootUrl: global.omnihive.serverSettings.config.webRootUrl });
            });

            app.use((err: any, _req: any, res: any, _next: any) => {
                return res.status(500).render("500", {
                    rootUrl: global.omnihive.serverSettings.config.webRootUrl,
                    registeredUrls: global.omnihive.registeredUrls,
                    status: global.omnihive.serverStatus,
                    error: serializeError(err),
                });
            });

            global.omnihive.appServer = app;
        }

        const server: Server = http.createServer(global.omnihive.appServer);
        global.omnihive.webServer?.removeAllListeners().close();
        global.omnihive.webServer = server;

        global.omnihive.webServer?.listen(global.omnihive.serverSettings.config.nodePortNumber, () => {
            logWorker?.write(
                OmniHiveLogLevel.Info,
                `New Server Listening on process ${process.pid} using port ${global.omnihive.serverSettings.config.nodePortNumber}`
            );
        });

        adminService.sendToAllClients<{ serverStatus: ServerStatus; serverError: any | undefined }>("status-response", {
            serverStatus: global.omnihive.serverStatus,
            serverError: global.omnihive.serverError,
        });

        logWorker?.write(OmniHiveLogLevel.Info, `Server Change Handler Completed`);
    };

    public getCleanAppServer = async (): Promise<express.Express> => {
        const logWorker: ILogWorker | undefined = global.omnihive.getWorker<ILogWorker>(
            HiveWorkerType.Log,
            "ohBootLogWorker"
        );

        const adminRoot: string = `/ohAdmin`;

        // Build app
        global.omnihive.registeredUrls = [];

        const app = express();

        app.use(helmet.dnsPrefetchControl());
        app.use(helmet.expectCt());
        app.use(helmet.frameguard());
        app.use(helmet.hidePoweredBy());
        app.use(helmet.hsts());
        app.use(helmet.ieNoOpen());
        app.use(helmet.noSniff());
        app.use(helmet.permittedCrossDomainPolicies());
        app.use(helmet.referrerPolicy());
        app.use(helmet.xssFilter());

        app.use(bodyParser.urlencoded({ extended: true }));
        app.use(bodyParser.json());
        app.use(cors());

        // Setup Pug
        app.set("view engine", "pug");
        app.set("views", path.join(global.omnihive.ohDirName, `app`, `views`));
        app.use("/public", express.static(path.join(global.omnihive.ohDirName, `app`, `public`)));

        // Register system REST endpoints

        const swaggerDefinition: swaggerUi.JsonObject = {
            info: {
                title: "OmniHive System Workers REST Interface",
                version: "1.0.0",
                description: "All system REST endpoint workers provided for OmniHive functionality",
            },
            license: {},
            openapi: "3.0.0",
            servers: [
                {
                    url: `${global.omnihive.serverSettings.config.webRootUrl}${adminRoot}/rest`,
                },
            ],
            paths: {},
            definitions: {},
        };

        global.omnihive.registeredWorkers
            .filter(
                (rw: RegisteredHiveWorker) =>
                    rw.type === HiveWorkerType.RestEndpointFunction && rw.enabled === true && rw.isCore === true
            )
            .forEach((rw: RegisteredHiveWorker) => {
                let workerMetaData: HiveWorkerMetadataRestFunction;

                try {
                    workerMetaData = ObjectHelper.createStrict<HiveWorkerMetadataRestFunction>(
                        HiveWorkerMetadataRestFunction,
                        rw.metadata
                    );
                } catch (e) {
                    logWorker?.write(
                        OmniHiveLogLevel.Error,
                        `Cannot register system REST worker ${rw.name}.  MetaData is incorrect.`
                    );

                    return;
                }

                const workerInstance: IRestEndpointWorker = rw.instance as IRestEndpointWorker;

                app[workerMetaData.restMethod](
                    `${adminRoot}/rest/${workerMetaData.urlRoute}`,
                    async (req: express.Request, res: express.Response) => {
                        res.setHeader("Content-Type", "application/json");

                        try {
                            const workerResponse: RestEndpointExecuteResponse = await AwaitHelper.execute(
                                workerInstance.execute(
                                    req.headers,
                                    `${req.protocol}://${req.get("host")}${req.originalUrl}`,
                                    req.body
                                )
                            );

                            if (workerResponse.response) {
                                res.status(workerResponse.status).json(workerResponse.response);
                            } else {
                                res.status(workerResponse.status).send(true);
                            }
                        } catch (e) {
                            return res.status(500).render("500", {
                                rootUrl: global.omnihive.serverSettings.config.webRootUrl,
                                error: serializeError(e),
                            });
                        }
                    }
                );

                global.omnihive.registeredUrls.push({
                    path: `${global.omnihive.serverSettings.config.webRootUrl}${adminRoot}/rest/${workerMetaData.urlRoute}`,
                    type: RegisteredUrlType.RestFunction,
                    metadata: {},
                });

                const workerSwagger: swaggerUi.JsonObject | undefined = workerInstance.getSwaggerDefinition();

                if (workerSwagger) {
                    swaggerDefinition.paths = { ...swaggerDefinition.paths, ...workerSwagger.paths };
                    swaggerDefinition.definitions = {
                        ...swaggerDefinition.definitions,
                        ...workerSwagger.definitions,
                    };
                }
            });

        app.get(`${adminRoot}/api-docs/swagger.json`, async (_req: express.Request, res: express.Response) => {
            res.setHeader("Content-Type", "application/json");
            return res.status(200).json(swaggerDefinition);
        });

        app.use(`${adminRoot}/api-docs`, swaggerUi.serve, swaggerUi.setup(swaggerDefinition));

        global.omnihive.registeredUrls.push({
            path: `${global.omnihive.serverSettings.config.webRootUrl}${adminRoot}/api-docs`,
            type: RegisteredUrlType.Swagger,
            metadata: {
                swaggerJsonUrl: `${global.omnihive.serverSettings.config.webRootUrl}${adminRoot}/api-docs/swagger.json`,
            },
        });

        return app;
    };
}
