import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { QueryCacheType } from "@withonevision/omnihive-core/enums/QueryCacheType";
import { RestMethod } from "@withonevision/omnihive-core/enums/RestMethod";
import { StringBuilder } from "@withonevision/omnihive-core/helpers/StringBuilder";
import { IEncryptionWorker } from "@withonevision/omnihive-core/interfaces/IEncryptionWorker";
import { ITokenWorker } from "@withonevision/omnihive-core/interfaces/ITokenWorker";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";
import { IHiveWorker } from "@withonevision/omnihive-core/interfaces/IHiveWorker";
import { EnvironmentVariable } from "@withonevision/omnihive-core/models/EnvironmentVariable";
import { RegisteredHiveWorker } from "@withonevision/omnihive-core/models/RegisteredHiveWorker";

export class OmniHiveClient {
    private static singleton: OmniHiveClient;

    private constructor() {}

    public static getSingleton = (): OmniHiveClient => {
        if (IsHelper.isNullOrUndefined(OmniHiveClient.singleton)) {
            OmniHiveClient.singleton = new OmniHiveClient();
        }

        return OmniHiveClient.singleton;
    };

    public accessToken: string = "";
    public authToken: string = "";
    public environmentVariables: EnvironmentVariable[] = [];
    public registeredWorkers: RegisteredHiveWorker[] = [];

    public static getNew = (): OmniHiveClient => {
        return new OmniHiveClient();
    };

    public init = async (
        workers: RegisteredHiveWorker[],
        environmentVariables?: EnvironmentVariable[]
    ): Promise<void> => {
        if (IsHelper.isNullOrUndefined(environmentVariables)) {
            environmentVariables = [];
        }

        this.environmentVariables = environmentVariables;

        for (let worker of workers) {
            this.pushWorker(worker);
        }

        for (let worker of this.registeredWorkers) {
            (worker.instance as IHiveWorker).registeredWorkers;
        }
    };

    public getWorker<T extends IHiveWorker | undefined>(type: string, name?: string): T | undefined {
        if (!IsHelper.isNullOrUndefined(name)) {
            const namedWorker: RegisteredHiveWorker | undefined = this.registeredWorkers.find(
                (value: RegisteredHiveWorker) => value.name === name && value.type === type
            );

            if (!IsHelper.isNullOrUndefined(namedWorker)) {
                return namedWorker.instance as T;
            }

            return undefined;
        }

        const anyWorkers: RegisteredHiveWorker[] | undefined = this.registeredWorkers.filter(
            (value: RegisteredHiveWorker) => value.type === type
        );

        if (!IsHelper.isNullOrUndefined(anyWorkers) && !IsHelper.isEmptyArray(anyWorkers)) {
            return anyWorkers[0].instance as T;
        }

        return undefined;
    }

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

    public runCustomSql = async (url: string, sql: string): Promise<any> => {
        let encryptionWorker: IEncryptionWorker | undefined = this.getWorker<IEncryptionWorker>(
            HiveWorkerType.Encryption
        );

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
        let encryptionWorker: IEncryptionWorker | undefined = this.getWorker<IEncryptionWorker>(
            HiveWorkerType.Encryption
        );

        if (IsHelper.isNullOrUndefined(encryptionWorker)) {
            throw new Error("[ohAccessError] Could not retrieve token");
        }

        const tokenWorker = this.getWorker<ITokenWorker | undefined>(HiveWorkerType.Token);

        if (IsHelper.isNullOrUndefined(tokenWorker)) {
            throw new Error("[ohAccessError] Could not retrieve token");
        }

        let newToken: string = "";

        if (!IsHelper.isNullOrUndefined(tokenWorker)) {
            try {
                newToken = await AwaitHelper.execute(tokenWorker.get());
            } catch (e) {
                throw new Error("[ohAccessError] Could not retrieve token");
            }
        }

        return newToken;
    };

    private pushWorker = async (worker: RegisteredHiveWorker): Promise<void> => {
        if (IsHelper.isNullOrUndefined(worker.instance)) {
            throw new Error("Cannot register worker without an instance");
        }

        if (
            this.registeredWorkers.find((value: RegisteredHiveWorker) => {
                return value.name === worker.name;
            })
        ) {
            return;
        }

        (worker.instance as IHiveWorker).environmentVariables = this.environmentVariables;
        await AwaitHelper.execute((worker.instance as IHiveWorker).init(worker.name, worker.metadata));
        this.registeredWorkers.push(worker);
    };
}
