import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { QueryCacheType } from "@withonevision/omnihive-core/enums/QueryCacheType";
import { RestMethod } from "@withonevision/omnihive-core/enums/RestMethod";
import { StringBuilder } from "@withonevision/omnihive-core/helpers/StringBuilder";
import { IEncryptionWorker } from "@withonevision/omnihive-core/interfaces/IEncryptionWorker";
import { ITokenWorker } from "@withonevision/omnihive-core/interfaces/ITokenWorker";
import { WorkerSetterBase } from "@withonevision/omnihive-core/models/WorkerSetterBase";
import objectHash from "object-hash";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { AppSettings } from "@withonevision/omnihive-core/models/AppSettings";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";

export class OmniHiveClient extends WorkerSetterBase {
    private static singleton: OmniHiveClient;

    private constructor() {
        super();
    }

    public static getSingleton = (): OmniHiveClient => {
        if (IsHelper.isNullOrUndefined(OmniHiveClient.singleton)) {
            OmniHiveClient.singleton = new OmniHiveClient();
        }

        return OmniHiveClient.singleton;
    };

    public accessToken: string = "";
    public authToken: string = "";
    private rootUrl: string = "";
    private tokenMetadata: any = {};

    public static getNew = (): OmniHiveClient => {
        return new OmniHiveClient();
    };

    public init = async (rootUrl: string, appSettings: AppSettings): Promise<void> => {
        this.rootUrl = rootUrl;
        this.appSettings = appSettings;

        if (
            !IsHelper.isNullOrUndefined(appSettings) &&
            !IsHelper.isNullOrUndefined(appSettings.workers) &&
            !IsHelper.isEmptyArray(appSettings.workers)
        ) {
            await AwaitHelper.execute(this.initWorkers());

            const tokenWorker = this.getWorker<ITokenWorker | undefined>(HiveWorkerType.Token);

            if (!IsHelper.isNullOrUndefined(tokenWorker)) {
                this.tokenMetadata = tokenWorker.config.metadata;
            }
        }
    };

    public graphClient = async (
        graphUrl: string,
        query: string,
        cacheType?: QueryCacheType,
        cacheExpireInSeconds?: number,
        headers?: any
    ): Promise<any> => {
        const graphCall: Promise<any> = new Promise<any>((resolve, reject) => {
            const config: any = {};

            if (IsHelper.isNullOrUndefined(headers)) {
                config.headers = {};
            } else if (!IsHelper.isEmptyObject(headers)) {
                config.headers = headers;
            }

            if (!IsHelper.isEmptyStringOrWhitespace(this.accessToken)) {
                config.headers["x-omnihive-access"] = this.accessToken;
            }

            if (!IsHelper.isEmptyStringOrWhitespace(this.authToken)) {
                config.headers["authorization"] = "BEARER " + this.authToken;
            }

            if (!IsHelper.isNullOrUndefined(cacheType)) {
                switch (cacheType) {
                    case QueryCacheType.None:
                        config.headers["x-omnihive-cache-type"] = "none";
                        break;
                    case QueryCacheType.FromCache:
                        config.headers["x-omnihive-cache-type"] = "cache";
                        break;
                    case QueryCacheType.FromCacheForceRefresh:
                        config.headers["x-omnihive-cache-type"] = "cacheRefresh";
                        break;
                }
            } else {
                config.headers["x-omnihive-cache-type"] = "none";
            }

            if (!IsHelper.isNullOrUndefined(cacheExpireInSeconds)) {
                try {
                    const cacheTimeNumber: number = +cacheExpireInSeconds;
                    config.headers["x-omnihive-cache-seconds"] = cacheTimeNumber;
                } catch {
                    config.headers["x-omnihive-cache-seconds"] = -1;
                }
            } else {
                config.headers["x-omnihive-cache-seconds"] = -1;
            }

            config.headers["Content-Type"] = "application/json";
            const dataObject: any = { query };

            axios
                .post(graphUrl, JSON.stringify(dataObject), config as Object)
                .then((response) => {
                    if (
                        !IsHelper.isNullOrUndefined(response.data.errors) &&
                        !IsHelper.isEmptyArray(response.data.errors)
                    ) {
                        const errorString: StringBuilder = new StringBuilder();

                        response.data.errors.forEach((err: any) => {
                            errorString.appendLine(err.message);
                        });

                        throw new Error(errorString.outputString());
                    }

                    resolve(response.data.data);
                })
                .catch((error) => {
                    if (error.message.includes("[ohAccessError]")) {
                        this.getNewToken()
                            .then((newToken: string | undefined) => {
                                if (
                                    IsHelper.isNullOrUndefined(newToken) ||
                                    IsHelper.isEmptyStringOrWhitespace(newToken)
                                ) {
                                    throw new Error("[ohAccessError] Could not retrieve token");
                                }

                                this.accessToken = newToken ?? "";
                                this.graphClient(graphUrl, query, cacheType, cacheExpireInSeconds, headers)
                                    .then((value) => resolve(value))
                                    .catch((error) => reject(error));
                            })
                            .catch((error) => {
                                reject(error);
                            });
                    } else {
                        reject(error);
                    }
                });
        });

        return graphCall;
    };

    public restClient = async (url: string, method: RestMethod, headers?: any, data?: any): Promise<any> => {
        return new Promise<AxiosResponse<any>>((resolve, reject) => {
            const config: AxiosRequestConfig = { url: url };

            if (IsHelper.isNullOrUndefined(headers)) {
                headers = {};
            }

            if (!IsHelper.isEmptyStringOrWhitespace(this.accessToken)) {
                config.headers["x-omnihive-access"] = this.accessToken;
            }

            if (!IsHelper.isEmptyStringOrWhitespace(this.authToken)) {
                config.headers["authorization"] = "BEARER " + this.authToken;
            }

            if (!IsHelper.isEmptyObject(headers)) {
                config.headers = headers;
            }

            if (!IsHelper.isNullOrUndefined(data)) {
                config.data = data;
            }

            switch (method) {
                case RestMethod.GET:
                    config.method = "GET";
                    break;
                case RestMethod.POST:
                    config.method = "POST";
                    break;
                case RestMethod.PATCH:
                    config.method = "PATCH";
                    break;
                case RestMethod.PUT:
                    config.method = "PUT";
                    break;
                case RestMethod.DELETE:
                    config.method = "DELETE";
                    break;
            }

            axios(config)
                .then((response: AxiosResponse) => {
                    if (
                        !IsHelper.isNullOrUndefined(response.data.errors) &&
                        !IsHelper.isEmptyArray(response.data.errors)
                    ) {
                        const errorString: StringBuilder = new StringBuilder();

                        response.data.errors.forEach((err: any) => {
                            errorString.appendLine(err.message);
                        });

                        throw new Error(errorString.outputString());
                    }

                    resolve(response.data);
                })
                .catch((error) => {
                    if (error.message.includes("[ohAccessError]")) {
                        this.getNewToken()
                            .then((newToken: string | undefined) => {
                                if (
                                    IsHelper.isNullOrUndefined(newToken) ||
                                    IsHelper.isEmptyStringOrWhitespace(newToken)
                                ) {
                                    throw new Error("[ohAccessError] Could not retrieve token");
                                }

                                this.accessToken = newToken ?? "";
                                this.restClient(url, method, headers, data)
                                    .then((value) => resolve(value))
                                    .catch((error) => reject(error));
                            })
                            .catch((error) => {
                                reject(error);
                            });
                    } else {
                        reject(error);
                    }
                });
        });
    };

    public runCustomSql = async (url: string, sql: string, encryptionWorkerName?: string): Promise<any> => {
        let encryptionWorker: IEncryptionWorker | undefined = undefined;

        if (
            !IsHelper.isNullOrUndefined(encryptionWorkerName) &&
            !IsHelper.isEmptyStringOrWhitespace(encryptionWorkerName)
        ) {
            encryptionWorker = this.getWorker<IEncryptionWorker | undefined>(
                HiveWorkerType.Encryption,
                encryptionWorkerName
            );
        } else {
            encryptionWorker = this.getWorker<IEncryptionWorker | undefined>(HiveWorkerType.Encryption);
        }

        if (IsHelper.isNullOrUndefined(encryptionWorker)) {
            throw new Error("No encryption worker found.  An encryption worker is required for custom SQL");
        }

        const target: string = `customSql`;
        const secureSql: string = encryptionWorker.symmetricEncrypt(sql);

        const query: string = `
            query {
                ${target}(
                    encryptedSql: "${secureSql}"
                ) {
                    recordset
                }
            }
        `;

        const results: any = await AwaitHelper.execute(this.graphClient(url, query));
        return results[target][0].recordset;
    };

    public setAccessToken = (token: string) => {
        this.accessToken = token;
    };

    public setAuthToken = (token: string) => {
        this.authToken = token;
    };

    private getNewToken = async (): Promise<string> => {
        const tokenWorker = this.getWorker<ITokenWorker | undefined>(HiveWorkerType.Token);
        let newToken: string = "";

        if (!IsHelper.isNullOrUndefined(tokenWorker)) {
            try {
                newToken = await AwaitHelper.execute(tokenWorker.get());
                return newToken;
            } catch (e) {
                throw new Error("[ohAccessError] Could not retrieve token");
            }
        }

        if (!IsHelper.isNullOrUndefined(this.tokenMetadata)) {
            const restPromise = new Promise<AxiosResponse<{ token: string }>>((resolve, reject) => {
                const config: AxiosRequestConfig = { url: `${this.rootUrl}/ohAdmin/rest/token` };
                config.data = {
                    generator: objectHash(this.tokenMetadata, {
                        algorithm: this.tokenMetadata.hashAlgorithm,
                        respectType: false,
                    }),
                };
                config.method = "POST";

                axios(config)
                    .then((response: AxiosResponse) => {
                        if (
                            !IsHelper.isNullOrUndefined(response.data.errors) &&
                            !IsHelper.isEmptyArray(response.data.errors)
                        ) {
                            const errorString: StringBuilder = new StringBuilder();

                            response.data.errors.forEach((err: any) => {
                                errorString.appendLine(err.message);
                            });

                            throw new Error(errorString.outputString());
                        }

                        resolve(response);
                    })
                    .catch((error) => {
                        reject(error);
                    });
            });

            const restReturn: AxiosResponse<{ token: string }> = await AwaitHelper.execute(restPromise);

            if (restReturn.status !== 200) {
                throw new Error("[ohAccessError] Could not retrieve token");
            }

            newToken = restReturn.data.token;
            return newToken;
        }

        throw new Error("[ohAccessError] Could not retrieve token");
    };
}
