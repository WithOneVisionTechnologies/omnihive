import { GraphQLSchema } from "graphql";
import { ConnectionSchema } from "../models/ConnectionSchema";
import { IDatabaseWorker } from "./IDatabaseWorker";
import { IHiveWorker } from "./IHiveWorker";

export interface IGraphBuildWorker extends IHiveWorker {
    buildDatabaseWorkerSchema: (
        databaseWorker: IDatabaseWorker,
        connectionSchema: ConnectionSchema | undefined
    ) => string | GraphQLSchema | undefined;
}
