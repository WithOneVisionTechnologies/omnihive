import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IRestEndpointWorker } from "@withonevision/omnihive-core/interfaces/IRestEndpointWorker";
import { ITokenWorker } from "@withonevision/omnihive-core/interfaces/ITokenWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import { RestEndpointExecuteResponse } from "@withonevision/omnihive-core/models/RestEndpointExecuteResponse";
import { serializeError } from "serialize-error";
import swaggerUi from "swagger-ui-express";
import isEqual from "lodash.isequal";
import objectHash from "object-hash";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";

export default class SystemAccessTokenWorker extends HiveWorkerBase implements IRestEndpointWorker {
    private tokenWorker!: ITokenWorker;

    constructor() {
        super();
    }

    public execute = async (_headers: any, _url: string, body: any): Promise<RestEndpointExecuteResponse> => {
        const tokenWorker: ITokenWorker | undefined = this.getWorker<ITokenWorker>(HiveWorkerType.Token);
        if (IsHelper.isNullOrUndefined(tokenWorker)) {
            throw new Error("Token Worker cannot be found");
        }

        this.tokenWorker = tokenWorker;

        try {
            this.checkRequest(body);
            const token = await AwaitHelper.execute(this.tokenWorker.get());
            return { response: { token: token }, status: 200 };
        } catch (e) {
            return { response: { error: serializeError(e) }, status: 400 };
        }
    };

    public getSwaggerDefinition = (): swaggerUi.JsonObject | undefined => {
        return {
            definitions: {
                SystemAccessTokenParameters: {
                    required: ["generator"],
                    properties: {
                        generator: {
                            type: "string",
                        },
                    },
                },
            },
            paths: {
                "/token": {
                    post: {
                        description: "Retrieve an OmniHive access token",
                        tags: [
                            {
                                name: "System",
                            },
                        ],
                        requestBody: {
                            required: true,
                            content: {
                                "application/json": {
                                    schema: {
                                        $ref: "#/definitions/SystemAccessTokenParameters",
                                    },
                                },
                            },
                        },
                        responses: {
                            "200": {
                                description: "OmniHive access token",
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

    private checkRequest = (body: any | undefined) => {
        if (IsHelper.isNullOrUndefined(body) || IsHelper.isNullOrUndefined(body.generator)) {
            throw new Error("Request must have parameters");
        }

        if (
            IsHelper.isNullOrUndefined(this.tokenWorker) ||
            IsHelper.isNullOrUndefined(this.tokenWorker.config.metadata)
        ) {
            throw new Error("A token worker cannot be found");
        }

        const hashedConfigMetadata = objectHash(this.tokenWorker.config.metadata, {
            algorithm: this.tokenWorker.config.metadata.hashAlgorithm,
            respectType: false,
        });

        if (!isEqual(hashedConfigMetadata, body.generator)) {
            throw new Error("Token cannot be generated");
        }
    };
}
