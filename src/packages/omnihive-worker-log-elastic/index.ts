import { ApiResponse, Client } from "@elastic/elasticsearch";
import { Context } from "@elastic/elasticsearch/lib/Transport";
import { OmniHiveLogLevel } from "@withonevision/omnihive-core/enums/OmniHiveLogLevel";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";
import { ILogWorker } from "@withonevision/omnihive-core/interfaces/ILogWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";

export class ElasticLogWorkerMetadata {
    public cloudId: string = "";
    public cloudPassword: string = "";
    public cloudUser: string = "";
    public logIndex: string = "";
}

export default class ElasticLogWorker extends HiveWorkerBase implements ILogWorker {
    private elasticClient!: Client;
    private logIndex!: string;

    constructor() {
        super();
    }

    public async init(name: string, metadata?: any): Promise<void> {
        await AwaitHelper.execute(super.init(name, metadata));
        const typedMetadata: ElasticLogWorkerMetadata = this.checkObjectStructure<ElasticLogWorkerMetadata>(
            ElasticLogWorkerMetadata,
            metadata
        );

        this.logIndex = typedMetadata.logIndex;

        this.elasticClient = new Client({
            cloud: {
                id: typedMetadata.cloudId,
            },
            auth: {
                username: typedMetadata.cloudUser,
                password: typedMetadata.cloudPassword,
            },
        });

        this.elasticClient.indices
            .exists({ index: typedMetadata.logIndex })
            .then((indexExists: ApiResponse<boolean, Context>) => {
                if (IsHelper.isNullOrUndefined(indexExists.body)) {
                    this.elasticClient.indices.create({ index: typedMetadata.logIndex });
                }
            });
    }

    public write = async (logLevel: OmniHiveLogLevel, logString: string): Promise<void> => {
        const logDate = new Date();

        try {
            this.elasticClient.index({
                index: this.logIndex,
                body: {
                    logDate,
                    severity: logLevel,
                    logString: logString,
                },
            });
        } catch {
            throw new Error("Elastic log could not be synchronized");
        }
    };
}
