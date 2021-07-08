import { IHiveWorker } from "./IHiveWorker";

export interface IDataLifecycleWorker extends IHiveWorker {
    // Response is a reference object of the response being returned from the current Graph Call
    execute: (response: any, obj: any, args: any, context: any, info: any) => Promise<{}>;
}
