import { AppSettings } from "../models/AppSettings";
import { IHiveWorker } from "./IHiveWorker";

export interface IConfigWorker extends IHiveWorker {
    get: () => Promise<AppSettings>;
    set: (settings: AppSettings) => Promise<boolean>;
}
