import { EnvironmentVariable } from "./EnvironmentVariable";
import { HiveWorker } from "./HiveWorker";

export class AppSettings {
    public environmentVariables: EnvironmentVariable[] = [];
    public workers: HiveWorker[] = [];
}
