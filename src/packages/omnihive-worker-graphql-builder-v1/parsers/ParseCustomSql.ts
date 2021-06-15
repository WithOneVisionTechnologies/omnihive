/// <reference path="../../../types/globals.omnihive.d.ts" />

import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IDatabaseWorker } from "@withonevision/omnihive-core/interfaces/IDatabaseWorker";
import { IEncryptionWorker } from "@withonevision/omnihive-core/interfaces/IEncryptionWorker";
import { ITokenWorker } from "@withonevision/omnihive-core/interfaces/ITokenWorker";
import { GraphContext } from "@withonevision/omnihive-core/models/GraphContext";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";

export class ParseCustomSql {
    public parse = async (
        workerName: string,
        encryptedSql: string,
        omniHiveContext: GraphContext
    ): Promise<any[][]> => {
        const databaseWorker: IDatabaseWorker | undefined = global.omnihive.getWorker<IDatabaseWorker | undefined>(
            HiveWorkerType.Database,
            workerName
        );

        if (IsHelper.isNullOrUndefined(databaseWorker)) {
            throw new Error(
                "Database Worker Not Defined.  This graph converter will not work without an Encryption worker."
            );
        }

        const encryptionWorker: IEncryptionWorker | undefined = global.omnihive.getWorker<
            IEncryptionWorker | undefined
        >(HiveWorkerType.Encryption);

        if (IsHelper.isNullOrUndefined(encryptionWorker)) {
            throw new Error(
                "Encryption Worker Not Defined.  This graph converter will not work without an Encryption worker."
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

        const decryptedSql = encryptionWorker.symmetricDecrypt(encryptedSql);
        return await AwaitHelper.execute(databaseWorker.executeQuery(decryptedSql));
    };
}
