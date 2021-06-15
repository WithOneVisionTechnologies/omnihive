import { serializeError } from "serialize-error";
import { EnvironmentVariableType } from "../enums/EnvironmentVariableType";
import { HiveWorkerType } from "../enums/HiveWorkerType";
import { OmniHiveLogLevel } from "../enums/OmniHiveLogLevel";
import { RegisteredHiveWorkerSection } from "../enums/RegisteredHiveWorkerSection";
import { AwaitHelper } from "../helpers/AwaitHelper";
import { IsHelper } from "../helpers/IsHelper";
import { IHiveWorker } from "../interfaces/IHiveWorker";
import { ILogWorker } from "../interfaces/ILogWorker";
import { AppSettings } from "./AppSettings";
import { EnvironmentVariable } from "./EnvironmentVariable";
import { HiveWorker } from "./HiveWorker";
import { RegisteredHiveWorker } from "./RegisteredHiveWorker";
import { WorkerGetterBase } from "./WorkerGetterBase";

export abstract class WorkerSetterBase extends WorkerGetterBase {
    constructor() {
        super();
    }

    public appSettings: AppSettings = new AppSettings();

    public checkWorkerImportPath = (hiveWorker: HiveWorker) => {
        if (
            IsHelper.isNullOrUndefined(hiveWorker.importPath) ||
            IsHelper.isEmptyStringOrWhitespace(hiveWorker.importPath) ||
            IsHelper.isNullOrUndefined(hiveWorker.package) ||
            IsHelper.isEmptyStringOrWhitespace(hiveWorker.package)
        ) {
            throw new Error(`Hive worker type ${hiveWorker.type} with name ${hiveWorker.name} has no import path`);
        }

        return;
    };

    public getEnvironmentVariable = <T extends string | number | boolean>(name: string): T | undefined => {
        const envVariable: EnvironmentVariable | undefined = this.appSettings.environmentVariables.find(
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

    public async initWorkers(): Promise<void> {
        try {
            for (const hiveWorker of this.appSettings.workers) {
                await AwaitHelper.execute(this.pushWorker(hiveWorker));
            }

            for (const worker of this.registeredWorkers) {
                (worker.instance as IHiveWorker).registeredWorkers = this.registeredWorkers;
                (worker.instance as IHiveWorker).appSettings = this.appSettings;
            }
        } catch (err) {
            throw new Error("Worker Factory Init Error => " + JSON.stringify(serializeError(err)));
        }
    }

    public async pushWorker(hiveWorker: HiveWorker, section?: RegisteredHiveWorkerSection): Promise<void> {
        const logWorker: ILogWorker | undefined = this.getWorker(HiveWorkerType.Log);

        if (!hiveWorker.enabled) {
            return;
        }

        if (IsHelper.isNullOrUndefined(section)) {
            section = RegisteredHiveWorkerSection.User;
        }

        if (
            this.registeredWorkers?.find((value: RegisteredHiveWorker) => {
                return value.name === hiveWorker.name;
            })
        ) {
            return;
        }

        this.checkWorkerImportPath(hiveWorker);

        let registerWorker: boolean = true;

        Object.keys(hiveWorker.metadata).forEach((metaKey: string) => {
            if (
                (hiveWorker.metadata[metaKey] as string).toString().startsWith("${") &&
                (hiveWorker.metadata[metaKey] as string).toString().endsWith("}")
            ) {
                let metaValue: string = hiveWorker.metadata[metaKey] as string;
                metaValue = metaValue.substr(2, metaValue.length - 3);

                if (!IsHelper.isNullOrUndefined(process) && !IsHelper.isNullOrUndefined(process.env)) {
                    const processEnvValue: string = process.env[metaValue]?.toString() ?? "";

                    if (IsHelper.isBoolean(processEnvValue)) {
                        hiveWorker.metadata[metaKey] = processEnvValue === "true";
                        return;
                    }

                    if (IsHelper.isNumber(processEnvValue)) {
                        hiveWorker.metadata[metaKey] = Number(processEnvValue);
                        return;
                    }

                    hiveWorker.metadata[metaKey] = String(processEnvValue);
                    return;
                }

                const environmentVariable: EnvironmentVariable | undefined = this.appSettings.environmentVariables.find(
                    (variable: EnvironmentVariable) => variable.key === metaKey
                );

                if (IsHelper.isNullOrUndefined(environmentVariable)) {
                    registerWorker = false;
                    logWorker?.write(
                        OmniHiveLogLevel.Warn,
                        `Cannot register ${hiveWorker.name}...missing ${metaKey} in constants`
                    );

                    return;
                }

                switch (environmentVariable.type) {
                    case EnvironmentVariableType.Boolean:
                        hiveWorker.metadata[metaKey] = environmentVariable.value === "true";
                        break;
                    case EnvironmentVariableType.Number:
                        hiveWorker.metadata[metaKey] = Number(environmentVariable.value);
                        break;
                    default:
                        hiveWorker.metadata[metaKey] = String(environmentVariable.value);
                        break;
                }
            }
        });

        if (!IsHelper.isNullOrUndefined(registerWorker)) {
            const newWorker: any = await import(hiveWorker.importPath);
            const newWorkerInstance: any = new newWorker.default();
            await AwaitHelper.execute((newWorkerInstance as IHiveWorker).init(hiveWorker));

            const registeredWorker: RegisteredHiveWorker = {
                ...hiveWorker,
                instance: newWorkerInstance,
                section,
            };
            this.registeredWorkers.push(registeredWorker);
        }
    }
}
