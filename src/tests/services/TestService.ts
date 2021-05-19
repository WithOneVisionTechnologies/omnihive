import { ObjectHelper } from "../../packages/omnihive-core/helpers/ObjectHelper";
import { TestConfigSettings } from "../models/TestConfigSettings";
import { TestSettings } from "../models/TestSettings";
import { WorkerSetterBase } from "../../packages/omnihive-core/models/WorkerSetterBase";
import fse from "fs-extra";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IHiveWorker } from "@withonevision/omnihive-core/interfaces/IHiveWorker";
import { HiveWorker } from "@withonevision/omnihive-core/models/HiveWorker";
import { RegisteredHiveWorker } from "@withonevision/omnihive-core/models/RegisteredHiveWorker";
import importFresh from "import-fresh";

export class TestService extends WorkerSetterBase {
    public clearWorkers = (): void => {
        this.registeredWorkers = [];
    };

    public getConstants = (): any | undefined => {
        try {
            if (!process.env.omnihive_test_settings) {
                return undefined;
            }

            const config: TestSettings = ObjectHelper.create(
                TestSettings,
                JSON.parse(fse.readFileSync(`${process.env.omnihive_test_settings}`, { encoding: "utf8" }))
            );

            return config.constants;
        } catch {
            return undefined;
        }
    };

    public getTestConfig = (packageName: string): TestConfigSettings | undefined => {
        try {
            if (!process.env.omnihive_test_settings) {
                return undefined;
            }

            const config: TestSettings = ObjectHelper.create(
                TestSettings,
                JSON.parse(fse.readFileSync(`${process.env.omnihive_test_settings}`, { encoding: "utf8" }))
            );

            return config.tests.find(
                (test: TestConfigSettings) => test.package === packageName && test.enabled === true
            );
        } catch {
            return undefined;
        }
    };

    public async pushWorker(hiveWorker: HiveWorker): Promise<void> {
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

        if (!hiveWorker.importPath || hiveWorker.importPath === "") {
            throw new Error(`Hive worker type ${hiveWorker.type} with name ${hiveWorker.name} has no import path`);
        }

        const newWorker: any = importFresh(hiveWorker.importPath);
        const newWorkerInstance: any = new newWorker.default();
        await AwaitHelper.execute((newWorkerInstance as IHiveWorker).init(hiveWorker));

        const registeredWorker: RegisteredHiveWorker = {
            ...hiveWorker,
            instance: newWorkerInstance,
            isBoot: false,
            isCore: false,
        };
        this.registeredWorkers.push(registeredWorker);
    }
}
