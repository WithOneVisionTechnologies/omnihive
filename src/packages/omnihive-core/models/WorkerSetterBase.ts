import { serializeError } from "serialize-error";
import { AwaitHelper } from "../helpers/AwaitHelper";
import { IHiveWorker } from "../interfaces/IHiveWorker";
import { HiveWorker } from "./HiveWorker";
import { RegisteredHiveWorker } from "./RegisteredHiveWorker";
import { ServerSettings } from "./ServerSettings";
import { WorkerGetterBase } from "./WorkerGetterBase";
import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { OmniHiveLogLevel } from "@withonevision/omnihive-core/enums/OmniHiveLogLevel";
import { ILogWorker } from "@withonevision/omnihive-core/interfaces/ILogWorker";

export abstract class WorkerSetterBase extends WorkerGetterBase {
    constructor() {
        super();
    }

    public serverSettings: ServerSettings = new ServerSettings();

    public async initWorkers(configs: HiveWorker[]): Promise<void> {
        try {
            for (const hiveWorker of configs) {
                await this.pushWorker(hiveWorker);
            }

            for (const worker of this.registeredWorkers) {
                (worker.instance as IHiveWorker).registeredWorkers = this.registeredWorkers;
                (worker.instance as IHiveWorker).serverSettings = this.serverSettings;
            }
        } catch (err) {
            throw new Error("Worker Factory Init Error => " + JSON.stringify(serializeError(err)));
        }
    }

    public async pushWorker(hiveWorker: HiveWorker): Promise<void> {
        const logWorker: ILogWorker | undefined = this.getWorker(HiveWorkerType.Log);

        if (!hiveWorker.enabled) {
            return;
        }

        if (
            this.registeredWorkers?.find((value: RegisteredHiveWorker) => {
                return value.name === hiveWorker.name;
            })
        ) {
            return;
        }

        if (
            !hiveWorker.importPath ||
            hiveWorker.importPath === "" ||
            !hiveWorker.package ||
            hiveWorker.package === ""
        ) {
            throw new Error(`Hive worker type ${hiveWorker.type} with name ${hiveWorker.name} has no import path`);
        }

        let registerWorker: boolean = true;

        Object.keys(hiveWorker.metadata).forEach((metaKey: string) => {
            if (typeof hiveWorker.metadata[metaKey] === "string") {
                if (
                    (hiveWorker.metadata[metaKey] as string).startsWith("${") &&
                    (hiveWorker.metadata[metaKey] as string).endsWith("}")
                ) {
                    let metaValue: string = hiveWorker.metadata[metaKey] as string;

                    metaValue = metaValue.substr(2, metaValue.length - 3);
                    const envValue: unknown | undefined = this.serverSettings.constants[metaValue];

                    if (envValue) {
                        hiveWorker.metadata[metaKey] = envValue;
                    } else {
                        registerWorker = false;
                        logWorker?.write(
                            OmniHiveLogLevel.Warn,
                            `Cannot register ${hiveWorker.name}...missing ${metaKey} in constants`
                        );
                    }
                }
            }
        });

        if (registerWorker) {
            const newWorker: any = await AwaitHelper.execute<any>(import(hiveWorker.importPath));
            const newWorkerInstance: any = new newWorker.default();
            await AwaitHelper.execute<void>((newWorkerInstance as IHiveWorker).init(hiveWorker));

            const registeredWorker: RegisteredHiveWorker = {
                ...hiveWorker,
                instance: newWorkerInstance,
                isBoot: false,
                isCore: false,
            };
            this.registeredWorkers.push(registeredWorker);
        }
    }
}
