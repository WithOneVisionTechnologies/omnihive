import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { ICacheWorker } from "@withonevision/omnihive-core/interfaces/ICacheWorker";
import { HiveWorker } from "@withonevision/omnihive-core/models/HiveWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import Redis from "ioredis";
import { serializeError } from "serialize-error";

export class RedisCacheWorkerMetadata {
    public connectionString: string = "";
}

export default class RedisCacheWorker extends HiveWorkerBase implements ICacheWorker {
    private redis!: Redis.Redis;

    constructor() {
        super();
    }

    public async init(config: HiveWorker): Promise<void> {
        try {
            await AwaitHelper.execute(super.init(config));
            const metadata: RedisCacheWorkerMetadata = this.checkObjectStructure<RedisCacheWorkerMetadata>(
                RedisCacheWorkerMetadata,
                config.metadata
            );
            this.redis = new Redis(metadata.connectionString);
        } catch (err) {
            throw new Error("Redis Init Error => " + JSON.stringify(serializeError(err)));
        }
    }

    public exists = async (key: string): Promise<boolean> => {
        return (await AwaitHelper.execute(this.redis.exists(key))) === 1;
    };

    public get = async (key: string): Promise<string | undefined> => {
        const value: string | null = await AwaitHelper.execute(this.redis.get(key));

        if (!value) {
            return undefined;
        }

        return value;
    };

    public set = async (key: string, value: string, expireSeconds: number): Promise<boolean> => {
        this.redis.set(key, value, "EX", expireSeconds);
        return true;
    };

    public remove = async (key: string): Promise<boolean> => {
        this.redis.del(key);
        return true;
    };
}
