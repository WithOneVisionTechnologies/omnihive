import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IPubSubServerWorker } from "@withonevision/omnihive-core/interfaces/IPubSubServerWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import { PubSubListener } from "@withonevision/omnihive-core/models/PubSubListener";
import PusherServer from "pusher";
import { serializeError } from "serialize-error";

export class PusherPubSubServerWorkerMetadata {
    public appId: string = "";
    public key: string = "";
    public secret: string = "";
    public cluster: string = "";
}

export default class PusherPubSubServerWorker extends HiveWorkerBase implements IPubSubServerWorker {
    private server!: PusherServer;
    private listeners: PubSubListener[] = [];

    constructor() {
        super();
    }

    public addListener = (_channelName: string, _eventName: string, _callback?: Function): void => {
        throw new Error("Not Available for This Worker");
    };

    public async init(name: string, metadata?: any): Promise<void> {
        try {
            await AwaitHelper.execute(super.init(name, metadata));
            const typedMetadata: PusherPubSubServerWorkerMetadata =
                this.checkObjectStructure<PusherPubSubServerWorkerMetadata>(PusherPubSubServerWorkerMetadata, metadata);
            this.server = new PusherServer({
                appId: typedMetadata.appId,
                key: typedMetadata.key,
                secret: typedMetadata.secret,
                cluster: typedMetadata.cluster,
            });
        } catch (err) {
            throw new Error(JSON.stringify(serializeError(err)));
        }
    }

    public emit = async (channelName: string, eventName: string, data: any): Promise<void> => {
        try {
            this.server.trigger(channelName, eventName, data);
        } catch (err) {
            throw new Error(JSON.stringify(serializeError(err)));
        }
    };

    public getListeners = (): PubSubListener[] => {
        return this.listeners;
    };

    public removeListener = (_channelName: string, _eventName: string): void => {
        throw new Error("Not Available for This Worker");
    };
}
