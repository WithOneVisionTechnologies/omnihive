import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { ICacheWorker } from "@withonevision/omnihive-core/interfaces/ICacheWorker";
import { HiveWorker } from "@withonevision/omnihive-core/models/HiveWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import NodeCache from "node-cache";

export default class NodeCacheWorker extends HiveWorkerBase implements ICacheWorker {
    private nodeCache!: NodeCache;

    constructor() {
        super();
    }

    public async init(config: HiveWorker): Promise<void> {
        await AwaitHelper.execute(super.init(config));
        this.nodeCache = new NodeCache();
    }

    public exists = async (key: string): Promise<boolean> => {
        return this.nodeCache.has(key);
    };

    public get = async (key: string): Promise<string | undefined> => {
        const value: string | undefined = this.nodeCache.get<string | undefined>(key);

        if (!value) {
            return undefined;
        }

        return value as string;
    };

    public set = async (key: string, value: string, expireSeconds: number): Promise<boolean> => {
        this.nodeCache.set<string>(key, value, expireSeconds);
        return true;
    };

    public remove = async (key: string): Promise<boolean> => {
        this.nodeCache.del(key);
        return true;
    };
}
