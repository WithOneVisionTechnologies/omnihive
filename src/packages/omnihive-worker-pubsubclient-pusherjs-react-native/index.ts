import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";
import { IPubSubClientWorker } from "@withonevision/omnihive-core/interfaces/IPubSubClientWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import { PubSubListener } from "@withonevision/omnihive-core/models/PubSubListener";
import Pusher, { Channel } from "pusher-js/react-native";
import { serializeError } from "serialize-error";

export class PusherJsReactNativePubSubClientWorkerMetadata {
    public key: string = "";
    public cluster: string = "";
    public maxRetries: number = 5;
}

export default class PusherJsReactNativePubSubClientWorker extends HiveWorkerBase implements IPubSubClientWorker {
    private connected: boolean = false;
    private pusher!: Pusher;
    private listeners: PubSubListener[] = [];
    private channels: Channel[] = [];
    private typedMetadata!: PusherJsReactNativePubSubClientWorkerMetadata;

    constructor() {
        super();
    }

    public async init(name: string, metadata?: any): Promise<void> {
        await AwaitHelper.execute(super.init(name, metadata));
        this.typedMetadata = this.checkObjectStructure<PusherJsReactNativePubSubClientWorkerMetadata>(
            PusherJsReactNativePubSubClientWorkerMetadata,
            metadata
        );
        await AwaitHelper.execute(this.connect());
    }

    public emit = async (eventName: string, message: any): Promise<void> => {
        this.pusher.send_event(eventName, message);
        return;
    };

    public getListeners = (): PubSubListener[] => {
        return this.listeners;
    };

    public getJoinedChannels = (): string[] => {
        const channelNames: string[] = [];

        this.channels.forEach((channel: Channel) => {
            channelNames.push(channel.name);
        });

        return channelNames;
    };

    public addListener = (channelName: string, eventName: string, callback?: Function): void => {
        this.checkConnection();

        try {
            if (!this.channels.some((channel: Channel) => channel.name === channelName)) {
                this.joinChannel(channelName);
            }

            this.removeListener(channelName, eventName);

            this.channels
                .filter((channel: Channel) => channel.name === channelName)[0]
                .bind(eventName, (data: any) => {
                    if (!IsHelper.isNullOrUndefined(callback) && IsHelper.isFunction(callback)) {
                        callback(data);
                    }
                });

            this.listeners.push({ channelName, eventName, callback });
        } catch (err) {
            throw new Error("PubSub Add Listener Error => " + JSON.stringify(serializeError(err)));
        }
    };

    public removeListener = (channelName: string, eventName: string): void => {
        this.checkConnection();

        try {
            if (
                this.listeners.some(
                    (listener: PubSubListener) =>
                        listener.channelName == channelName && listener.eventName === eventName
                )
            ) {
                this.listeners = this.listeners.filter(
                    (listener: PubSubListener) =>
                        listener.channelName == channelName && listener.eventName !== eventName
                );
                this.channels.filter((channel: Channel) => channel.name === channelName)[0].unbind(eventName);
            }
        } catch (err) {
            throw new Error("PubSub Remove Listener Error => " + JSON.stringify(serializeError(err)));
        }
    };

    public connect = async (retry: number = 0): Promise<void> => {
        try {
            if (this.connected) {
                return;
            }

            this.pusher = new Pusher(this.typedMetadata.key, { cluster: this.typedMetadata.cluster });
            this.connected = true;
        } catch (err) {
            if (retry <= this.typedMetadata.maxRetries) {
                this.connect(retry++);
            } else {
                throw new Error("The maximum amount of retries to connect has been reached.");
            }
        }
    };

    public disconnect = (): void => {
        if (IsHelper.isNullOrUndefined(this.pusher)) {
            throw new Error("Pusher is not instantiated.");
        }

        try {
            this.checkConnection(false);

            if (this.connected) {
                this.listeners.filter((listener: PubSubListener) => {
                    this.removeListener(listener.channelName, listener.eventName);
                });

                this.listeners = [];

                this.getJoinedChannels().forEach((channel: string) => {
                    this.leaveChannel(channel);
                });

                this.channels = [];

                this.pusher.disconnect();
                this.connected = false;
            }
        } catch (err) {
            throw new Error("PubSub Disconnect Error => " + JSON.stringify(serializeError(err)));
        }
    };

    public joinChannel = (channelName: string): void => {
        if (IsHelper.isNullOrUndefined(this.pusher)) {
            throw new Error("Pusher is not instantiated.");
        }

        this.checkConnection();

        try {
            if (!this.channels.some((channel: Channel) => channel.name === channelName)) {
                this.channels.push(this.pusher.subscribe(channelName));
            }
        } catch (err) {
            throw new Error("PubSub Join Channel Error => " + JSON.stringify(serializeError(err)));
        }
    };

    public leaveChannel = (channelName: string): void => {
        if (IsHelper.isNullOrUndefined(this.pusher)) {
            throw new Error("Pusher is not instantiated.");
        }

        this.checkConnection();

        try {
            if (this.channels.some((channel: Channel) => channel.name === channelName)) {
                this.channels.filter((channel: Channel) => channel.name === channelName)[0].unbind_all();
                this.channels = this.channels.filter((channel: Channel) => channel.name !== channelName);
                this.pusher.unsubscribe(channelName);
            }
        } catch (err) {
            throw new Error("PubSub Leave Channel Error => " + JSON.stringify(serializeError(err)));
        }
    };

    private checkConnection = (autoConnect: boolean = true): boolean => {
        if (!this.connected && autoConnect) {
            try {
                this.connect();

                return true;
            } catch (err) {
                throw new Error(err.message);
            }
        } else if (!this.connected && !autoConnect) {
            return false;
        } else {
            return true;
        }
    };
}
