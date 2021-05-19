import { HiveWorker } from "@withonevision/omnihive-core/models/HiveWorker";
import { BaseSettings } from "./BaseSettings";

export class BootLoaderSettings {
    public baseSettings!: BaseSettings;
    public configWorker!: HiveWorker;
}
