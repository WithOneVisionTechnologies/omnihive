import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";
import { ITokenWorker } from "@withonevision/omnihive-core/interfaces/ITokenWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import { v4 as uuidv4 } from "uuid";

export class JsonWebTokenWorkerMetadata {
    public tokenSecret: string = "";
    public audience: string = "";
    public expiresIn: number | string = "";
    public verifyOn: boolean = true;
}

export default class JsonWebTokenWorker extends HiveWorkerBase implements ITokenWorker {
    private typedMetadata!: JsonWebTokenWorkerMetadata;
    private token: string = "";

    constructor() {
        super();
    }

    public async init(name: string, metadata?: any): Promise<void> {
        await AwaitHelper.execute(super.init(name, metadata));

        try {
            this.typedMetadata = this.checkObjectStructure<JsonWebTokenWorkerMetadata>(
                JsonWebTokenWorkerMetadata,
                metadata
            );
        } catch {
            this.typedMetadata = {
                audience: uuidv4(),
                expiresIn: "30m",
                tokenSecret: nanoid(64),
                verifyOn: true,
            };
        }
    }

    public get = async (): Promise<string> => {
        const jwtPayload = { omnihiveAccess: true, aud: this.typedMetadata.audience };

        if (this.token !== "" && !this.expired(this.token)) {
            return this.token;
        }

        this.token = jwt.sign(jwtPayload, this.typedMetadata.tokenSecret, { expiresIn: this.typedMetadata.expiresIn });
        return this.token;
    };

    public expired = async (token: string): Promise<boolean> => {
        return !(await AwaitHelper.execute(this.verify(token)));
    };

    public verify = async (accessToken: string): Promise<boolean> => {
        if (!this.typedMetadata.verifyOn) {
            return true;
        }

        try {
            const decoded = jwt.verify(accessToken, this.typedMetadata.tokenSecret, {
                audience: this.typedMetadata.audience,
            });

            if (!IsHelper.isNullOrUndefined(decoded)) {
                return true;
            } else {
                return false;
            }
        } catch {
            return false;
        }
    };
}
