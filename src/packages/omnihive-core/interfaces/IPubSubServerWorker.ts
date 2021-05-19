import { PubSubListener } from "../models/PubSubListener";
import { IHiveWorker } from "./IHiveWorker";

export interface IPubSubServerWorker extends IHiveWorker {
    addListener: (channelName: string, eventName: string, callback: any) => void;
    emit: (channelName: string, eventName: string, message: {}) => Promise<void>;
    getListeners: () => PubSubListener[];
    removeListener: (channelName: string, eventName: string) => void;
}
