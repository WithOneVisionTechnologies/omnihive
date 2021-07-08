import { EnvironmentVariable } from "../models/EnvironmentVariable";
import { RegisteredHiveWorker } from "../models/RegisteredHiveWorker";

export interface IHiveWorker {
    environmentVariables: EnvironmentVariable[];
    metadata: any;
    name: string;
    registeredWorkers: RegisteredHiveWorker[];

    checkObjectStructure: <T extends object>(type: { new (): T }, model: any | null) => T;
    checkMetadata: (metadata: any) => void;
    getWorker: <T extends IHiveWorker | undefined>(type: string, name?: string) => T | undefined;
    init: (name: string, metadata?: any) => Promise<void>;
}
