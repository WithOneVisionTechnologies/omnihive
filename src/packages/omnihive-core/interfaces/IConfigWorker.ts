import { ServerSettings } from "../models/ServerSettings";
import { IHiveWorker } from "./IHiveWorker";

export interface IConfigWorker extends IHiveWorker {
    get: () => Promise<ServerSettings>;
    set: (settings: ServerSettings) => Promise<boolean>;
}
