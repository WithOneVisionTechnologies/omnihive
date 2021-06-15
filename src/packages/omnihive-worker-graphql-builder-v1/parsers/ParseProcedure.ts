/// <reference path="../../../types/globals.omnihive.d.ts" />

import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IDatabaseWorker } from "@withonevision/omnihive-core/interfaces/IDatabaseWorker";
import { ITokenWorker } from "@withonevision/omnihive-core/interfaces/ITokenWorker";
import { ConnectionSchema } from "@withonevision/omnihive-core/models/ConnectionSchema";
import { GraphContext } from "@withonevision/omnihive-core/models/GraphContext";
import { ProcFunctionSchema } from "@withonevision/omnihive-core/models/ProcFunctionSchema";
import { FieldNode, GraphQLResolveInfo, SelectionNode } from "graphql";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";

export class ParseProcedure {
    public parse = async (
        workerName: string,
        resolveInfo: GraphQLResolveInfo,
        omniHiveContext: GraphContext
    ): Promise<{ procName: string; results: any[][] }[]> => {
        const databaseWorker: IDatabaseWorker | undefined = global.omnihive.getWorker<IDatabaseWorker | undefined>(
            HiveWorkerType.Database,
            workerName
        );

        if (IsHelper.isNullOrUndefined(databaseWorker)) {
            throw new Error(
                "Database Worker Not Defined.  This graph converter will not work without a database worker."
            );
        }

        const tokenWorker: ITokenWorker | undefined = global.omnihive.getWorker<ITokenWorker | undefined>(
            HiveWorkerType.Token
        );

        let disableSecurity: boolean =
            global.omnihive.getEnvironmentVariable<boolean>("OH_SECURITY_DISABLE_TOKEN_CHECK") ?? false;

        if (!disableSecurity && IsHelper.isNullOrUndefined(tokenWorker)) {
            throw new Error("[ohAccessError] No token worker defined.");
        }

        if (
            !disableSecurity &&
            !IsHelper.isNullOrUndefined(tokenWorker) &&
            (IsHelper.isNullOrUndefined(omniHiveContext) ||
                IsHelper.isNullOrUndefined(omniHiveContext.access) ||
                IsHelper.isEmptyStringOrWhitespace(omniHiveContext.access))
        ) {
            throw new Error("[ohAccessError] Access token is invalid or expired.");
        }

        if (
            !disableSecurity &&
            !IsHelper.isNullOrUndefined(tokenWorker) &&
            !IsHelper.isNullOrUndefined(omniHiveContext) &&
            !IsHelper.isNullOrUndefined(omniHiveContext.access) &&
            !IsHelper.isEmptyStringOrWhitespace(omniHiveContext.access)
        ) {
            const verifyToken: boolean = await AwaitHelper.execute(tokenWorker.verify(omniHiveContext.access));
            if (!verifyToken) {
                throw new Error("[ohAccessError] Access token is invalid or expired.");
            }
        }

        const schema: ConnectionSchema | undefined = global.omnihive.registeredSchemas.find(
            (value: ConnectionSchema) => value.workerName === workerName
        );
        let fullSchema: ProcFunctionSchema[] = [];

        if (!IsHelper.isNullOrUndefined(schema)) {
            fullSchema = schema.procFunctions;
        }

        const response: { procName: string; results: any[][] }[] = [];

        const procCall: readonly SelectionNode[] = resolveInfo.operation.selectionSet.selections;

        for (const call of procCall) {
            const callFieldNode = call as FieldNode;
            const inputArgs: readonly SelectionNode[] | undefined = callFieldNode.selectionSet?.selections;

            if (IsHelper.isNullOrUndefined(inputArgs)) {
                throw new Error("Procedure Graph Construction is Incorrect");
            }

            for (const selection of inputArgs) {
                const selectionFieldNode = selection as FieldNode;
                const proc: ProcFunctionSchema[] | undefined = fullSchema.filter((s) => {
                    return s.name === selectionFieldNode.name.value;
                });

                if (IsHelper.isNullOrUndefined(proc) || IsHelper.isEmptyArray(proc)) {
                    throw new Error("Procedure Graph Construction is Incorrect");
                }

                const procArgs: { name: string; value: any; isString: boolean }[] = [];

                selectionFieldNode.arguments?.forEach((args: any) => {
                    procArgs.push({
                        name: args.name.value,
                        value: args.value.value,
                        isString: args.value.kind === "StringValue",
                    });
                });

                response.push({
                    procName: proc[0].name,
                    results: await AwaitHelper.execute(databaseWorker.executeProcedure(proc, procArgs)),
                });
            }
        }

        return response;
    };
}
