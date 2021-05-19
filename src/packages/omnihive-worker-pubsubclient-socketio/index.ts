import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IPubSubClientWorker } from "@withonevision/omnihive-core/interfaces/IPubSubClientWorker";
import { HiveWorker } from "@withonevision/omnihive-core/models/HiveWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import { PubSubListener } from "@withonevision/omnihive-core/models/PubSubListener";
import { serializeError } from "serialize-error";
import * as socketio from "socket.io-client";

export class SocketIoPubSubClientWorkerMetadata {
    public serverUrl: string = "";
    public maxRetries: number = 5;
}

export default class SocketIoPubSubClientWorker extends HiveWorkerBase implements IPubSubClientWorker {
    private connected: boolean = false;
    private ioClient!: socketio.Socket;
    private listeners: PubSubListener[] = [];
    private rooms: string[] = [];
    private metadata!: SocketIoPubSubClientWorkerMetadata;

    constructor() {
        super();
    }

    public async init(config: HiveWorker): Promise<void> {
        await AwaitHelper.execute<void>(super.init(config));
        this.metadata = this.checkObjectStructure<SocketIoPubSubClientWorkerMetadata>(
            SocketIoPubSubClientWorkerMetadata,
            this.config.metadata
        );
        this.ioClient = socketio.io({ path: this.metadata.serverUrl });

        this.ioClient.on("connect", () => {
            this.connect();
        });

        this.ioClient.on("disconnect", () => {
            this.disconnect();
        });
    }

    public addListener = (channelName: string, eventName: string, callback?: Function): void => {
        this.checkConnection();

        try {
            if (!this.rooms.some((room: string) => room === channelName)) {
                this.joinChannel(channelName);
            }

            this.removeListener(channelName, eventName);

            if (!this.listeners.some((listener: PubSubListener) => listener.eventName === eventName)) {
                this.ioClient.on(eventName, (packet: { room: string; data: any }) => {
                    if (packet.room === channelName && callback && typeof callback === "function") {
                        callback(packet.data);
                    }
                });
            }

            this.listeners.push({ channelName, eventName, callback });
        } catch (err) {
            throw new Error("PubSub Add Listener Error => " + JSON.stringify(serializeError(err)));
        }
    };

    public emit = async (eventName: string, message: any): Promise<void> => {
        this.checkConnection();
        this.ioClient.emit(eventName, message);
        return;
    };

    public getJoinedChannels = (): string[] => {
        return this.rooms;
    };

    public getListeners = (): PubSubListener[] => {
        return this.listeners;
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

                if (
                    !this.listeners.some((listener: PubSubListener) => listener.eventName === eventName) &&
                    this.ioClient.hasListeners(eventName)
                ) {
                    this.ioClient.off(eventName);
                }
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

            this.ioClient.connect();
            this.connected = true;
        } catch (err) {
            if (retry <= this.metadata.maxRetries) {
                this.connect(retry++);
            } else {
                throw new Error("The maximum amount of retries to connect has been reached.");
            }
        }
    };

    public disconnect = (): void => {
        if (!this.ioClient) {
            throw new Error("Socket.IO is not instantiated.");
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

                this.rooms = [];

                this.ioClient.disconnect();
                this.connected = false;
            }
        } catch (err) {
            throw new Error("PubSub Disconnect Error => " + JSON.stringify(serializeError(err)));
        }
    };

    public joinChannel = (channelName: string): void => {
        if (!this.ioClient) {
            throw new Error("Socket.IO is not instantiated.");
        }

        this.checkConnection();

        try {
            if (!this.rooms.some((room: string) => room === channelName)) {
                this.ioClient.emit("join-room", channelName);
                this.rooms.push(channelName);
            }
        } catch (err) {
            throw new Error("PubSub Join Channel Error => " + JSON.stringify(serializeError(err)));
        }
    };

    public leaveChannel = (channelName: string): void => {
        if (!this.ioClient) {
            throw new Error("Socket.IO is not instantiated.");
        }

        this.checkConnection();

        try {
            if (this.rooms.some((room: string) => room === channelName)) {
                this.ioClient.emit("leave-room", channelName);
                this.rooms = this.rooms.filter((room: string) => room !== channelName);
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
