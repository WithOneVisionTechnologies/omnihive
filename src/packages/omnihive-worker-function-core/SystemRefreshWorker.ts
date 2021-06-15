import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";
import { IRestEndpointWorker } from "@withonevision/omnihive-core/interfaces/IRestEndpointWorker";
import { ITokenWorker } from "@withonevision/omnihive-core/interfaces/ITokenWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import { RestEndpointExecuteResponse } from "@withonevision/omnihive-core/models/RestEndpointExecuteResponse";
import { serializeError } from "serialize-error";
import swaggerUi from "swagger-ui-express";

class SystemRefreshRequest {
    adminPassword!: string;
}

export default class SystemRefreshWorker extends HiveWorkerBase implements IRestEndpointWorker {
    private tokenWorker!: ITokenWorker;

    constructor() {
        super();
    }

    public execute = async (headers: any, _url: string, body: any): Promise<RestEndpointExecuteResponse> => {
        const tokenWorker: ITokenWorker | undefined = this.getWorker<ITokenWorker>(HiveWorkerType.Token);

        if (IsHelper.isNullOrUndefined(tokenWorker)) {
            throw new Error("Token Worker cannot be found");
        }

        this.tokenWorker = tokenWorker;

        try {
            this.checkRequest(headers, body);
            return { response: { message: "Server Refresh/Reset Initiated" }, status: 200 };
        } catch (e) {
            return { response: { error: serializeError(e) }, status: 400 };
        }
    };

    public getSwaggerDefinition = (): swaggerUi.JsonObject => {
        return {
            definitions: {
                ServerResetParameters: {
                    required: ["adminPassword"],
                    properties: {
                        adminPassword: {
                            type: "string",
                        },
                    },
                },
            },
            paths: {
                "/refresh": {
                    post: {
                        description: "Resets your OmniHive Server",
                        tags: [
                            {
                                name: "System",
                            },
                        ],
                        parameters: [
                            {
                                in: "header",
                                name: "x-omnihive-access",
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
                                        $ref: "#/definitions/ServerResetParameters",
                                    },
                                },
                            },
                        },
                        responses: {
                            "200": {
                                description: "OmniHive Refresh Response",
                                content: {
                                    "text/plain": {
                                        schema: {
                                            type: "string",
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
        if (IsHelper.isNullOrUndefined(body) || IsHelper.isNullOrUndefined(headers)) {
            throw new Error("Request Denied");
        }

        if (IsHelper.isNullOrUndefined(headers["x-omnihive-access"])) {
            throw new Error("[ohAccessError] Token Invalid");
        }

        if (!this.tokenWorker?.verify(headers["x-omnihive-access"])) {
            throw new Error("[ohAccessError] Token Invalid");
        }

        const bodyStructured: SystemRefreshRequest = this.checkObjectStructure<SystemRefreshRequest>(
            SystemRefreshRequest,
            body
        );

        if (IsHelper.isNullOrUndefinedOrEmptyStringOrWhitespace(bodyStructured.adminPassword)) {
            throw new Error(`Request Denied`);
        }

        if (bodyStructured.adminPassword !== global.omnihive.getEnvironmentVariable<string>("OH_ADMIN_PASSWORD")) {
            throw new Error(`Request Denied`);
        }
    };
}
