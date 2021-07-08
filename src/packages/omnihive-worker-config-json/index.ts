/// <reference path="../../types/globals.omnihive.d.ts" />

import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { ObjectHelper } from "@withonevision/omnihive-core/helpers/ObjectHelper";
import { IConfigWorker } from "@withonevision/omnihive-core/interfaces/IConfigWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import fse from "fs-extra";
import { serializeError } from "serialize-error";
import { ServerConfig } from "@withonevision/omnihive-core/models/ServerConfig";

export class JsonConfigWorkerMetadata {
    public configPath: string = "";
}

export default class JsonConfigWorker extends HiveWorkerBase implements IConfigWorker {
    private configPath: string = "";

    constructor() {
        super();
    }

    public async init(name: string, metadata?: any): Promise<void> {
        try {
            await AwaitHelper.execute(super.init(name, metadata));
            const typedMetadata: JsonConfigWorkerMetadata = this.checkObjectStructure<JsonConfigWorkerMetadata>(
                JsonConfigWorkerMetadata,
                metadata
            );

            this.configPath = global.omnihive.getFilePath(typedMetadata.configPath);

            if (!fse.existsSync(this.configPath)) {
                throw new Error("Config path cannot be found");
            }
        } catch (err) {
            throw new Error("Json Config Worker Init Error => " + JSON.stringify(serializeError(err)));
        }
    }

    public get = async (): Promise<ServerConfig> => {
        const loadedFile = ObjectHelper.create<ServerConfig>(
            ServerConfig,
            JSON.parse(fse.readFileSync(this.configPath, { encoding: "utf8" }))
        );

        loadedFile.environmentVariables.forEach((value) => {
            value.isSystem = false;
        });

        return loadedFile;
    };

    public set = async (settings: ServerConfig): Promise<boolean> => {
        settings.environmentVariables.forEach((value) => {
            delete value.isSystem;
        });

        fse.writeFileSync(this.configPath, JSON.stringify(settings));
        return true;
    };
}
