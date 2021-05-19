import { HiveWorker } from "./HiveWorker";

export class ServerSettings {
    public constants: { [key: string]: unknown } = {};
    public features: { [key: string]: unknown } = {};
    public workers: HiveWorker[] = [];
}
