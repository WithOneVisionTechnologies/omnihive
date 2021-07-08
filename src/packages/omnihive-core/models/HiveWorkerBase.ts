/// <reference path="../../../types/globals.omnihive.d.ts" />

import { ObjectHelper } from "../helpers/ObjectHelper";
import { IsHelper } from "../helpers/IsHelper";
import { EnvironmentVariable } from "./EnvironmentVariable";
import { EnvironmentVariableType } from "../enums/EnvironmentVariableType";
import { RegisteredHiveWorker } from "./RegisteredHiveWorker";
import { IHiveWorker } from "../interfaces/IHiveWorker";

export abstract class HiveWorkerBase implements IHiveWorker {
    public environmentVariables: EnvironmentVariable[] = [];
    public metadata!: any;
    public name!: string;
    public registeredWorkers: RegisteredHiveWorker[] = [];

    public async init(name: string, metadata?: any): Promise<void> {
        this.name = name;
        this.metadata = metadata;

        if (!IsHelper.isNullOrUndefined(metadata)) {
            this.checkMetadata(metadata);
        }
    }

    public checkObjectStructure = <T extends object>(type: { new (): T }, model: any | null): T => {
        const objectData: T = ObjectHelper.createStrict<T>(type, model);
        const objectAny: any = objectData as any;

        Object.keys(objectData).forEach((key: string) => {
            if (IsHelper.isNullOrUndefined(objectAny[key])) {
                throw new Error(`Object key ${key} is null or undefined on hive worker ${this.name}`);
            }
        });

        return objectData;
    };

    public checkMetadata = (metadata: any) => {
        Object.keys(metadata).forEach((metaKey: string) => {
            if (
                (metadata[metaKey] as string).toString().startsWith("${") &&
                (metadata[metaKey] as string).toString().endsWith("}")
            ) {
                let metaValue: string = metadata[metaKey] as string;
                metaValue = metaValue.substr(2, metaValue.length - 3);

                const environmentVariable: EnvironmentVariable | undefined = this.environmentVariables.find(
                    (variable: EnvironmentVariable) => variable.key === metaValue
                );

                if (IsHelper.isNullOrUndefined(environmentVariable)) {
                    throw new Error(`Metadata key ${metaKey} invalid or not set for worker ${this.name}`);
                }

                switch (environmentVariable.type) {
                    case EnvironmentVariableType.Boolean:
                        this.metadata[metaKey] =
                            environmentVariable.value === "true" || environmentVariable.value === true;
                        break;
                    case EnvironmentVariableType.Number:
                        this.metadata[metaKey] = Number(environmentVariable.value);
                        break;
                    default:
                        this.metadata[metaKey] = String(environmentVariable.value);
                        break;
                }
            }
        });
    };

    public getEnvironmentVariable = <T extends string | number | boolean>(name: string): T | undefined => {
        const envVariable: EnvironmentVariable | undefined = this.environmentVariables.find(
            (variable: EnvironmentVariable) => variable.key === name
        );

        if (IsHelper.isNullOrUndefined(envVariable)) {
            return undefined;
        }

        try {
            return envVariable.value as T;
        } catch {
            return undefined;
        }
    };

    public getWorker<T extends IHiveWorker | undefined>(type: string, name?: string): T | undefined {
        if (!IsHelper.isNullOrUndefined(name)) {
            const namedWorker: RegisteredHiveWorker | undefined = this.registeredWorkers.find(
                (value: RegisteredHiveWorker) => value.name === name && value.type === type
            );

            if (!IsHelper.isNullOrUndefined(namedWorker)) {
                return namedWorker.instance as T;
            }

            return undefined;
        }

        const anyWorkers: RegisteredHiveWorker[] | undefined = this.registeredWorkers.filter(
            (value: RegisteredHiveWorker) => value.type === type
        );

        if (!IsHelper.isNullOrUndefined(anyWorkers) && !IsHelper.isEmptyArray(anyWorkers)) {
            return anyWorkers[0].instance as T;
        }

        return undefined;
    }
}
