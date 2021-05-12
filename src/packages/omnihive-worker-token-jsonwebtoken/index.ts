import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { ITokenWorker } from "@withonevision/omnihive-core/interfaces/ITokenWorker";
import { HiveWorker } from "@withonevision/omnihive-core/models/HiveWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import { v4 as uuidv4 } from "uuid";

export class JsonWebTokenWorkerMetadata {
    public tokenSecret: string = "";
    public audience: string = "";
    public expiresIn: number | string = "";
    public hashAlgorithm: string = "";
    public verifyOn: boolean = true;
}

export default class JsonWebTokenWorker extends HiveWorkerBase implements ITokenWorker {
    private metadata!: JsonWebTokenWorkerMetadata;
    private token: string = "";

    constructor() {
        super();
    }

    public async init(config: HiveWorker): Promise<void> {
        await AwaitHelper.execute(super.init(config));

        try {
            this.metadata = this.checkObjectStructure<JsonWebTokenWorkerMetadata>(
                JsonWebTokenWorkerMetadata,
                config.metadata
            );
        } catch {
            this.metadata = {
                audience: uuidv4(),
                expiresIn: "30m",
                hashAlgorithm: "sha1",
                tokenSecret: nanoid(64),
                verifyOn: true,
            };
        }
    }

    public get = async (): Promise<string> => {
        const jwtPayload = { omnihiveAccess: true, aud: this.metadata.audience };

        if (this.token !== "" && !this.expired(this.token)) {
            return this.token;
        }

        this.token = jwt.sign(jwtPayload, this.metadata.tokenSecret, { expiresIn: this.metadata.expiresIn });
        return this.token;
    };

    public expired = async (token: string): Promise<boolean> => {
        return !(await AwaitHelper.execute(this.verify(token)));
    };

    public verify = async (accessToken: string): Promise<boolean> => {
        if (this.config.metadata.verifyOn === false) {
            return true;
        }

        try {
            const decoded = jwt.verify(accessToken, this.metadata.tokenSecret, { audience: this.metadata.audience });

            if (decoded) {
                return true;
            } else {
                return false;
            }
        } catch {
            return false;
        }
    };
}
