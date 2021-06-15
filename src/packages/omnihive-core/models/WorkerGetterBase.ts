import { IsHelper } from "../helpers/IsHelper";
import { IHiveWorker } from "../interfaces/IHiveWorker";
import { RegisteredHiveWorker } from "./RegisteredHiveWorker";

export abstract class WorkerGetterBase {
    public registeredWorkers: RegisteredHiveWorker[] = [];

    public getWorker<T extends IHiveWorker | undefined>(type: string, name?: string): T | undefined {
        if (!IsHelper.isNullOrUndefined(name)) {
            const namedWorker: RegisteredHiveWorker | undefined = this.registeredWorkers.find(
                (value: RegisteredHiveWorker) => value.name === name && value.type === type && value.enabled
            );

            if (!IsHelper.isNullOrUndefined(namedWorker)) {
                return namedWorker.instance as T;
            }

            return undefined;
        }

        const defaultWorker: RegisteredHiveWorker | undefined = this.registeredWorkers.find(
            (value: RegisteredHiveWorker) => value.type === type && value.enabled && value.default
        );

        if (!IsHelper.isNullOrUndefined(defaultWorker)) {
            return defaultWorker.instance as T;
        }

        const anyWorkers: RegisteredHiveWorker[] | undefined = this.registeredWorkers.filter(
            (value: RegisteredHiveWorker) => value.type === type && value.enabled
        );

        if (!IsHelper.isNullOrUndefined(anyWorkers) && !IsHelper.isEmptyArray(anyWorkers)) {
            return anyWorkers[0].instance as T;
        }

        return undefined;
    }
}
