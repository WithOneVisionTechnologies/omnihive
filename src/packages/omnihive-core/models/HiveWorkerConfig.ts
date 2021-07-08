import { HiveWorkerType } from "../enums/HiveWorkerType";

export class HiveWorkerConfig {
    public type: HiveWorkerType | string = HiveWorkerType.User;
    public name: string = "";
    public package: string = "";
    public version: string = "";
    public importPath: string = "";
    public default: boolean = true;
    public enabled: boolean = true;
    public metadata: any = {};
}
