/// <reference path="../../types/globals.omnihive.d.ts" />

import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { ObjectHelper } from "@withonevision/omnihive-core/helpers/ObjectHelper";
import { IConfigWorker } from "@withonevision/omnihive-core/interfaces/IConfigWorker";
import { HiveWorker } from "@withonevision/omnihive-core/models/HiveWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import fse from "fs-extra";
import { serializeError } from "serialize-error";
import { AppSettings } from "@withonevision/omnihive-core/models/AppSettings";
import yaml from "yaml";

export class JsonConfigWorkerMetadata {
    public configPath: string = "";
}

export default class JsonConfigWorker extends HiveWorkerBase implements IConfigWorker {
    private configPath: string = "";

    constructor() {
        super();
    }

    public async init(config: HiveWorker): Promise<void> {
        try {
            await AwaitHelper.execute(super.init(config));
            const metadata: JsonConfigWorkerMetadata = this.checkObjectStructure<JsonConfigWorkerMetadata>(
                JsonConfigWorkerMetadata,
                config.metadata
            );

            this.configPath = global.omnihive.getFilePath(metadata.configPath);

            if (!fse.existsSync(this.configPath)) {
                throw new Error("Config path cannot be found");
            }
        } catch (err) {
            throw new Error("YAML Config Worker Init Error => " + JSON.stringify(serializeError(err)));
        }
    }

    public get = async (): Promise<AppSettings> => {
        const loadedFile = ObjectHelper.create<AppSettings>(
            AppSettings,
            yaml.parse(fse.readFileSync(this.configPath, { encoding: "utf8" }))
        );

        loadedFile.environmentVariables.forEach((value) => {
            value.isSystem = false;
        });

        return loadedFile;
    };

    public set = async (settings: AppSettings): Promise<boolean> => {
        settings.environmentVariables.forEach((value) => {
            delete value.isSystem;
        });

        fse.writeFileSync(this.configPath, yaml.stringify(settings));
        return true;
    };
}
