import { StoredProcSchema } from "./StoredProcSchema";
import { TableSchema } from "./TableSchema";

export class ConnectionSchema {
    public workerName: string = "";
    public tables: TableSchema[] = [];
    public storedProcs: StoredProcSchema[] = [];
}
