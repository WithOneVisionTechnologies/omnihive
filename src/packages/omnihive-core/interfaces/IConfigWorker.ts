import { ServerConfig } from "../models/ServerConfig";
import { IHiveWorker } from "./IHiveWorker";

export interface IConfigWorker extends IHiveWorker {
    get: () => Promise<ServerConfig>;
    set: (serverConfig: ServerConfig) => Promise<boolean>;
}
