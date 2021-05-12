import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { ObjectHelper } from "@withonevision/omnihive-core/helpers/ObjectHelper";
import { IConfigWorker } from "@withonevision/omnihive-core/interfaces/IConfigWorker";
import { HiveWorker } from "@withonevision/omnihive-core/models/HiveWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import { ServerSettings } from "@withonevision/omnihive-core/models/ServerSettings";
import fse from "fs-extra";
import { serializeError } from "serialize-error";
import path from "path";
import { StringHelper } from "@withonevision/omnihive-core/helpers/StringHelper";

export class JsonConfigWorkerMetadata {
    public settingsPath: string = "";
}

export default class JsonConfigWorker extends HiveWorkerBase implements IConfigWorker {
    private settingsPath: string = "";

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

            if (this.pathExists(metadata.settingsPath)) {
                this.settingsPath = metadata.settingsPath;
            }

            if (
                StringHelper.isNullOrWhiteSpace(this.settingsPath) &&
                this.pathExists(path.join(global.omnihive.ohDirName, metadata.settingsPath))
            ) {
                this.settingsPath = path.join(global.omnihive.ohDirName, metadata.settingsPath);
            }

            if (
                StringHelper.isNullOrWhiteSpace(this.settingsPath) &&
                !StringHelper.isNullOrWhiteSpace(global.omnihive.commandLineArgs.environmentFile) &&
                this.pathExists(
                    path.join(path.parse(global.omnihive.commandLineArgs.environmentFile).dir, metadata.settingsPath)
                )
            ) {
                this.settingsPath = path.join(
                    path.parse(global.omnihive.commandLineArgs.environmentFile).dir,
                    metadata.settingsPath
                );
            }

            if (StringHelper.isNullOrWhiteSpace(this.settingsPath)) {
                throw new Error("Json Config Worker Path Not Available");
            }
        } catch (err) {
            throw new Error("Json Config Worker Init Error => " + JSON.stringify(serializeError(err)));
        }
    }

    public get = async (): Promise<ServerSettings> => {
        return ObjectHelper.create<ServerSettings>(ServerSettings, JSON.parse(this.readFile(this.settingsPath)));
    };

    public set = async (settings: ServerSettings): Promise<boolean> => {
        this.writeJsonToFile(this.settingsPath, settings);
        return true;
    };

    private pathExists = (path: string): boolean => {
        return fse.existsSync(path);
    };

    private readFile = (path: string): string => {
        return fse.readFileSync(path, { encoding: "utf8" });
    };

    private writeJsonToFile = (path: string, data: any): void => {
        fse.writeFileSync(path, JSON.stringify(data));
    };
}
