import { ProcFunctionSchema } from "./ProcFunctionSchema";
import { TableSchema } from "./TableSchema";

export class ConnectionSchema {
    public workerName: string = "";
    public tables: TableSchema[] = [];
    public procFunctions: ProcFunctionSchema[] = [];
}
