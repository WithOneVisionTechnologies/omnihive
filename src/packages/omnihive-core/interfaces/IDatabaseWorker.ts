import { ConnectionSchema } from "../models/ConnectionSchema";
import { ProcFunctionSchema } from "../models/ProcFunctionSchema";
import { IHiveWorker } from "./IHiveWorker";

export interface IDatabaseWorker extends IHiveWorker {
    connection: any;
    executeQuery: (query: string, disableLog?: boolean) => Promise<any[][]>;
    executeProcedure: (
        procFunctionSchema: ProcFunctionSchema[],
        args: { name: string; value: any; isString: boolean }[]
    ) => Promise<any[][]>;
    getSchema: () => Promise<ConnectionSchema>;
}
