import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { IRestEndpointWorker } from "@withonevision/omnihive-core/interfaces/IRestEndpointWorker";
import { ITokenWorker } from "@withonevision/omnihive-core/interfaces/ITokenWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import { RestEndpointExecuteResponse } from "@withonevision/omnihive-core/models/RestEndpointExecuteResponse";
import { serializeError } from "serialize-error";
import swaggerUi from "swagger-ui-express";

class SystemRegisterRequest {
    adminPassword!: string;
}

export default class SystemRegisterWorker extends HiveWorkerBase implements IRestEndpointWorker {
    private tokenWorker!: ITokenWorker;

    constructor() {
        super();
    }

    public execute = async (headers: any, _url: string, body: any): Promise<RestEndpointExecuteResponse> => {
        const tokenWorker: ITokenWorker | undefined = this.getWorker<ITokenWorker>(HiveWorkerType.Token);

        if (!tokenWorker) {
            throw new Error("Token Worker cannot be found");
        }

        this.tokenWorker = tokenWorker;

        try {
            this.checkRequest(headers, body);
            return { response: { verified: true }, status: 200 };
        } catch (e) {
            return { response: { error: serializeError(e) }, status: 400 };
        }
    };

    public getSwaggerDefinition = (): swaggerUi.JsonObject | undefined => {
        return {
            definitions: {
                RegisterParameters: {
                    required: ["adminPassword"],
                    properties: {
                        adminPassword: {
                            type: "string",
                        },
                    },
                },
            },
            paths: {
                "/register": {
                    post: {
                        description: "Checks if your register server settings are correct",
                        tags: [
                            {
                                name: "System",
                            },
                        ],
                        parameters: [
                            {
                                in: "header",
                                name: "ohAccess",
                                required: true,
                                schema: {
                                    type: "string",
                                },
                            },
                        ],
                        requestBody: {
                            required: true,
                            content: {
                                "application/json": {
                                    schema: {
                                        $ref: "#/definitions/RegisterParameters",
                                    },
                                },
                            },
                        },
                        responses: {
                            "200": {
                                description: "OmniHive Register Response",
                                content: {
                                    "text/plain": {
                                        schema: {
                                            type: "boolean",
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };
    };

    private checkRequest = (headers: any | undefined, body: any | undefined) => {
        if (!body || !headers) {
            throw new Error("Request Denied");
        }

        if (!headers.ohAccess) {
            throw new Error("[ohAccessError] Token Invalid");
        }

        if (!this.tokenWorker?.verify(headers.ohAccess)) {
            throw new Error("[ohAccessError] Token Invalid");
        }

        const bodyStructured: SystemRegisterRequest = this.checkObjectStructure<SystemRegisterRequest>(
            SystemRegisterRequest,
            body
        );

        if (!bodyStructured.adminPassword || bodyStructured.adminPassword === "") {
            throw new Error(`Request Denied`);
        }

        if (bodyStructured.adminPassword !== this.serverSettings.config.adminPassword) {
            throw new Error(`Request Denied`);
        }
    };
}
