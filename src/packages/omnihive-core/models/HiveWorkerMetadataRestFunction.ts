import { RestMethod } from "../enums/RestMethod";

export class HiveWorkerMetadataRestFunction {
    public restMethod: RestMethod = RestMethod.POST;
    public urlRoute: string = "";
    public data: any = {};
}
