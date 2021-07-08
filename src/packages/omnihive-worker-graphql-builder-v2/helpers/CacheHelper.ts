import { ICacheWorker } from "@withonevision/omnihive-core/interfaces/ICacheWorker";
import { OmniHiveLogLevel } from "src/packages/omnihive-core/enums/OmniHiveLogLevel";
import { AwaitHelper } from "src/packages/omnihive-core/helpers/AwaitHelper";
import { IEncryptionWorker } from "src/packages/omnihive-core/interfaces/IEncryptionWorker";
import { ILogWorker } from "src/packages/omnihive-core/interfaces/ILogWorker";

export class CacheHelper {
    // Workers
    private cacheWorker: ICacheWorker | undefined;
    private logWorker: ILogWorker | undefined;
    private encryptionWorker: IEncryptionWorker | undefined;

    // Cache Global Values
    private cacheSeconds: number = -1;
    private cacheKey: string = "";

    constructor(cacheWorker?: ICacheWorker, logWorker?: ILogWorker, encryptionWorker?: IEncryptionWorker) {
        this.cacheWorker = cacheWorker;
        this.logWorker = logWorker;
        this.encryptionWorker = encryptionWorker;
    }

    public updateCacheValues = (context: any, workerName: string, sql: string) => {
        // Reset Values
        this.cacheKey = "";
        this.cacheSeconds = -1;

        // Retrieve the cache seconds from the OmniHive Context
        if (context?.cacheSeconds) {
            try {
                this.cacheSeconds = +context.cacheSeconds;
            } catch {
                this.cacheSeconds = -1;
            }
        }

        // If the caching level is not set to none retrieve the cache key for the query
        if (this.encryptionWorker && context?.cache && context.cache !== "none") {
            this.cacheKey = this.encryptionWorker.base64Encode(workerName + "||||" + sql);
        }
    };

    /**
     * See if the sql query has been saved in the cache
     *
     * @param workerName
     * @param omniHiveContext
     * @param sql
     * @param cacheKey
     * @returns { Promise<any> }
     */
    public checkCache = async (workerName: string, omniHiveContext: any, sql: string): Promise<any> => {
        if (this.cacheWorker) {
            // Check the context to see if caching flags are set
            if (omniHiveContext?.cache && omniHiveContext.cache === "cache" && this.cacheKey) {
                // Verify the key exists
                const keyExists: boolean = await AwaitHelper.execute(this.cacheWorker.exists(this.cacheKey));

                // If the key exists retrieve the results
                if (keyExists) {
                    this.logWorker?.write(OmniHiveLogLevel.Info, `(Retrieved from Cache) => ${workerName} => ${sql}`);
                    const cacheResults: string | undefined = await AwaitHelper.execute(
                        this.cacheWorker.get(this.cacheKey)
                    );

                    try {
                        // If results are not falsy then return the Object
                        if (cacheResults) {
                            return JSON.parse(cacheResults);
                        }
                    } catch {
                        omniHiveContext.cache = "cacheRefresh";
                    }
                }
            }
        }
    };

    /**
     * Set the results in the cache
     *
     * @param workerName
     * @param omniHiveContext
     * @param sql
     * @param cacheKey
     * @param cacheSeconds
     * @param results
     * @returns { Promise<void> }
     */
    public setCache = async (workerName: string, omniHiveContext: any, sql: string, results: any): Promise<void> => {
        if (this.cacheWorker) {
            // If the no caching flag is not set save the results to cache
            if (omniHiveContext?.cache && omniHiveContext.cache !== "none" && this.cacheKey) {
                this.logWorker?.write(OmniHiveLogLevel.Info, `(Written to Cache) => ${workerName} => ${sql}`);
                this.cacheWorker.set(this.cacheKey, JSON.stringify(results), this.cacheSeconds);
            }
        }
    };
}
