import { EnvironmentVariable } from "./EnvironmentVariable";
import { HiveWorkerConfig } from "./HiveWorkerConfig";

export class ServerConfig {
    public environmentVariables: EnvironmentVariable[] = [];
    public workers: HiveWorkerConfig[] = [];
}
