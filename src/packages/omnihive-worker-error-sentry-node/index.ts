import * as Sentry from "@sentry/node";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IErrorWorker } from "@withonevision/omnihive-core/interfaces/IErrorWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import { serializeError } from "serialize-error";

export class SentryErrorWorkerMetadata {
    public sentryDsn: string = "";
    public environment: string = "";
    public hostname: string = "";
}

export default class SentryErrorWorker extends HiveWorkerBase implements IErrorWorker {
    constructor() {
        super();
    }

    public async init(name: string, metadata?: any): Promise<void> {
        try {
            await AwaitHelper.execute(super.init(name, metadata));
            const typedMetadata: SentryErrorWorkerMetadata = this.checkObjectStructure<SentryErrorWorkerMetadata>(
                SentryErrorWorkerMetadata,
                metadata
            );

            Sentry.init({
                dsn: typedMetadata.sentryDsn,
                environment: typedMetadata.environment,
                serverName: typedMetadata.hostname,
            });
        } catch (err) {
            throw new Error("Sentry Error Worker Error => " + JSON.stringify(serializeError(err)));
        }
    }

    public handleException = async (error: string): Promise<void> => {
        Sentry.captureException(new Error(error));
    };
}
