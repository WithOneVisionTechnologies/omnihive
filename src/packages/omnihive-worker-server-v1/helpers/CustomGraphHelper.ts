import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";
import { IGraphEndpointWorker } from "@withonevision/omnihive-core/interfaces/IGraphEndpointWorker";
import { RegisteredHiveWorker } from "@withonevision/omnihive-core/models/RegisteredHiveWorker";
import { GraphContext } from "src/packages/omnihive-core/models/GraphContext";

export class CustomGraphHelper {
    public parseCustomGraph = async (
        workerName: string,
        customArgs: any,
        omniHiveContext: GraphContext
    ): Promise<any> => {
        const worker: RegisteredHiveWorker | undefined = global.omnihive.registeredWorkers.find(
            (w: RegisteredHiveWorker) => w.name === workerName
        );

        if (IsHelper.isNullOrUndefined(worker)) {
            throw new Error(`Worker ${workerName} cannot be found`);
        }

        const workerInstace = worker.instance as IGraphEndpointWorker;
        const customFunctionReturn = await AwaitHelper.execute(workerInstace.execute(customArgs, omniHiveContext));
        return customFunctionReturn;
    };
}
