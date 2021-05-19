import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { QueryCacheType } from "@withonevision/omnihive-core/enums/QueryCacheType";
import { RestMethod } from "@withonevision/omnihive-core/enums/RestMethod";
import { StringBuilder } from "@withonevision/omnihive-core/helpers/StringBuilder";
import { IEncryptionWorker } from "@withonevision/omnihive-core/interfaces/IEncryptionWorker";
import { ITokenWorker } from "@withonevision/omnihive-core/interfaces/ITokenWorker";
import { ClientSettings } from "@withonevision/omnihive-core/models/ClientSettings";
import { WorkerSetterBase } from "@withonevision/omnihive-core/models/WorkerSetterBase";
import objectHash from "object-hash";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";

export class OmniHiveClient extends WorkerSetterBase {
    private static singleton: OmniHiveClient;

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    private constructor() {
        super();
    }

    public static getSingleton = (): OmniHiveClient => {
        if (!OmniHiveClient.singleton) {
            OmniHiveClient.singleton = new OmniHiveClient();
        }

        return OmniHiveClient.singleton;
    };

    public accessToken: string = "";
    public authToken: string = "";
    private clientSettings: ClientSettings | undefined = undefined;

    public static getNew = (): OmniHiveClient => {
        return new OmniHiveClient();
    };

    public init = async (clientSettings: ClientSettings): Promise<void> => {
        this.clientSettings = clientSettings;

        if (clientSettings && clientSettings.workers && clientSettings.workers.length > 0) {
            await AwaitHelper.execute(this.initWorkers(clientSettings.workers));

            const tokenWorker = this.getWorker<ITokenWorker | undefined>(HiveWorkerType.Token);

            if (tokenWorker) {
                this.clientSettings.tokenMetadata = tokenWorker.config.metadata;
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

            if (!headers) {
                config.headers = {};
            } else if (Object.keys(headers).length > 0) {
                config.headers = headers;
            }

            if (this.accessToken !== "") {
                config.headers["ohaccess"] = this.accessToken;
            }

            if (this.authToken !== "") {
                config.headers["authorization"] = "BEARER " + this.authToken;
            }

            if (!(cacheType === null || cacheType === undefined)) {
                switch (cacheType) {
                    case QueryCacheType.None:
                        config.headers["ohcache"] = "none";
                        break;
                    case QueryCacheType.FromCache:
                        config.headers["ohcache"] = "cache";
                        break;
                    case QueryCacheType.FromCacheForceRefresh:
                        config.headers["ohcache"] = "cacheRefresh";
                        break;
                }
            } else {
                config.headers["ohcache"] = "none";
            }

            if (!(cacheExpireInSeconds === null || cacheExpireInSeconds === undefined)) {
                try {
                    const cacheTimeNumber: number = +cacheExpireInSeconds;
                    config.headers["ohcacheseconds"] = cacheTimeNumber;
                } catch {
                    config.headers["ohcacheseconds"] = -1;
                }
            } else {
                config.headers["ohcacheseconds"] = -1;
            }

            config.headers["Content-Type"] = "application/json";
            const dataObject: any = { query };

            axios
                .post(graphUrl, JSON.stringify(dataObject), config as Object)
                .then((response) => {
                    if (response.data.errors != null && response.data.errors.length > 0) {
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
                                if (!newToken) {
                                    throw new Error("[ohAccessError] Could not retrieve token");
                                }

                                this.accessToken = newToken;
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

            if (headers == null) {
                headers = {};
            }

            if (this.accessToken !== "") {
                config.headers["ohaccess"] = this.accessToken;
            }

            if (this.authToken !== "") {
                config.headers["authorization"] = "BEARER " + this.authToken;
            }

            if (Object.keys(headers).length > 0) {
                config.headers = headers;
            }

            if (data != null) {
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
                    if (response.data.errors != null && response.data.errors.length > 0) {
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
                                if (!newToken) {
                                    throw new Error("[ohAccessError] Could not retrieve token");
                                }

                                this.accessToken = newToken;
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

        if (encryptionWorkerName) {
            encryptionWorker = this.getWorker<IEncryptionWorker | undefined>(
                HiveWorkerType.Encryption,
                encryptionWorkerName
            );
        } else {
            encryptionWorker = this.getWorker<IEncryptionWorker | undefined>(HiveWorkerType.Encryption);
        }

        if (!encryptionWorker) {
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

        if (tokenWorker) {
            try {
                newToken = await AwaitHelper.execute(tokenWorker.get());
                return newToken;
            } catch (e) {
                throw new Error("[ohAccessError] Could not retrieve token");
            }
        }

        if (this.clientSettings?.tokenMetadata) {
            const restPromise = new Promise<AxiosResponse<{ token: string }>>((resolve, reject) => {
                const config: AxiosRequestConfig = { url: `${this.clientSettings?.rootUrl}/ohAdmin/rest/token` };
                config.data = {
                    generator: objectHash(this.clientSettings?.tokenMetadata, {
                        algorithm: this.clientSettings?.tokenMetadata.hashAlgorithm,
                        respectType: false,
                    }),
                };
                config.method = "POST";

                axios(config)
                    .then((response: AxiosResponse) => {
                        if (response.data.errors != null && response.data.errors.length > 0) {
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
