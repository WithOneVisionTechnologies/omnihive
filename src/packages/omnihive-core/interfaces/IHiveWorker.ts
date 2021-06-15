import { HiveWorker } from "../models/HiveWorker";
import { RegisteredHiveWorker } from "../models/RegisteredHiveWorker";
import { AppSettings } from "../models/AppSettings";

export interface IHiveWorker {
    appSettings: AppSettings;
    checkObjectStructure: <T extends object>(type: { new (): T }, model: any | null) => T;
    config: HiveWorker;
    getWorker: <T extends IHiveWorker | undefined>(type: string, name?: string) => T | undefined;
    init: (hiveWorker: HiveWorker) => Promise<void>;
    registeredWorkers: RegisteredHiveWorker[];
}
