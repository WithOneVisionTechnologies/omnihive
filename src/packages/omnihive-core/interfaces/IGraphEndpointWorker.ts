import { GraphContext } from "../models/GraphContext";
import { IHiveWorker } from "./IHiveWorker";

export interface IGraphEndpointWorker extends IHiveWorker {
    execute: (customArgs: any, omniHiveContext: GraphContext) => Promise<{}>;
}
