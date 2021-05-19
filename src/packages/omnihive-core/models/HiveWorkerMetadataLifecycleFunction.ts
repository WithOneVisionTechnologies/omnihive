import { LifecycleWorkerAction } from "../enums/LifecycleWorkerAction";
import { LifecycleWorkerStage } from "../enums/LifecycleWorkerStage";

export class HiveWorkerMetadataLifecycleFunction {
    public lifecycleAction: LifecycleWorkerAction = LifecycleWorkerAction.None;
    public lifecycleStage: LifecycleWorkerStage = LifecycleWorkerStage.None;
    public lifecycleOrder: number = 0;
    public lifecycleWorker: string = "";
    public lifecycleTables: string[] = [];
}
