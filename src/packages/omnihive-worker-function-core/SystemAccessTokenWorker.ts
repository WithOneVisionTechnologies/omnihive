import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IRestEndpointWorker } from "@withonevision/omnihive-core/interfaces/IRestEndpointWorker";
import { ITokenWorker } from "@withonevision/omnihive-core/interfaces/ITokenWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import { RestEndpointExecuteResponse } from "@withonevision/omnihive-core/models/RestEndpointExecuteResponse";
import { serializeError } from "serialize-error";
import swaggerUi from "swagger-ui-express";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";
import { IEncryptionWorker } from "@withonevision/omnihive-core/interfaces/IEncryptionWorker";

export default class SystemAccessTokenWorker extends HiveWorkerBase implements IRestEndpointWorker {
    private tokenWorker!: ITokenWorker;
    private encryptionWorker!: IEncryptionWorker;

    constructor() {
        super();
    }

    public execute = async (_headers: any, _url: string, body: any): Promise<RestEndpointExecuteResponse> => {
        const tokenWorker: ITokenWorker | undefined = this.getWorker<ITokenWorker>(HiveWorkerType.Token);
        if (IsHelper.isNullOrUndefined(tokenWorker)) {
            throw new Error("Token Worker cannot be found");
        }

        this.tokenWorker = tokenWorker;

        const encryptionWorker: IEncryptionWorker | undefined = this.getWorker<IEncryptionWorker>(
            HiveWorkerType.Encryption
        );
        if (IsHelper.isNullOrUndefined(encryptionWorker)) {
            throw new Error("Encryption Worker cannot be found");
        }

        this.encryptionWorker = encryptionWorker;

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

        if (IsHelper.isNullOrUndefined(this.tokenWorker) || IsHelper.isNullOrUndefined(this.tokenWorker.metadata)) {
            throw new Error("A token worker cannot be found");
        }

        const encryptedMetadata = this.encryptionWorker.symmetricEncrypt(JSON.stringify(this.tokenWorker.metadata));

        if (body.generator !== encryptedMetadata) {
            throw new Error("Token cannot be generated");
        }
    };
}
