import { ObjectHelper } from "../helpers/ObjectHelper";
import { IHiveWorker } from "../interfaces/IHiveWorker";
import { HiveWorker } from "./HiveWorker";
import { AppSettings } from "./AppSettings";
import { WorkerGetterBase } from "./WorkerGetterBase";
import { IsHelper } from "../helpers/IsHelper";

export abstract class HiveWorkerBase extends WorkerGetterBase implements IHiveWorker {
    constructor() {
        super();
    }

    public config!: HiveWorker;
    public appSettings!: AppSettings;

    public async init(config: HiveWorker): Promise<void> {
        if (IsHelper.isNullOrUndefined(config) || IsHelper.isEmptyObject(config)) {
            throw new Error("Configuration not specified");
        }

        this.config = config;
    }

    public checkObjectStructure = <T extends object>(type: { new (): T }, model: any | null): T => {
        const objectData: T = ObjectHelper.createStrict<T>(type, model);
        const objectAny: any = objectData as any;

        Object.keys(objectData).forEach((key: string) => {
            if (IsHelper.isNullOrUndefined(objectAny[key])) {
                throw new Error(`Object key ${key} is null or undefined on hive worker ${this.config.name}`);
            }
        });

        return objectData;
    };
}
