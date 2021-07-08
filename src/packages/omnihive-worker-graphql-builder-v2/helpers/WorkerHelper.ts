import { Knex } from "knex";
import { HiveWorkerType } from "src/packages/omnihive-core/enums/HiveWorkerType";
import { AwaitHelper } from "src/packages/omnihive-core/helpers/AwaitHelper";
import { ICacheWorker } from "src/packages/omnihive-core/interfaces/ICacheWorker";
import { IDatabaseWorker } from "src/packages/omnihive-core/interfaces/IDatabaseWorker";
import { IDateWorker } from "src/packages/omnihive-core/interfaces/IDateWorker";
import { IEncryptionWorker } from "src/packages/omnihive-core/interfaces/IEncryptionWorker";
import { ILogWorker } from "src/packages/omnihive-core/interfaces/ILogWorker";
import { ITokenWorker } from "src/packages/omnihive-core/interfaces/ITokenWorker";
import { GraphContext } from "src/packages/omnihive-core/models/GraphContext";

export class WorkerHelper {
    /**
     * Set the required workers for the parser
     *
     * @param workerName
     * @returns { any }
     */
    public getRequiredWorkers = (workerName: string): any => {
        let logWorker, databaseWorker, knex, encryptionWorker, cacheWorker, dateWorker;

        // Set the log worker
        logWorker = global.omnihive.getWorker<ILogWorker | undefined>(HiveWorkerType.Log);

        // Set the database worker
        databaseWorker = global.omnihive.getWorker<IDatabaseWorker | undefined>(HiveWorkerType.Database, workerName);

        // Set the knex object from the database worker
        knex = databaseWorker?.connection as Knex;

        // Set the encryption worker
        encryptionWorker = global.omnihive.getWorker<IEncryptionWorker | undefined>(HiveWorkerType.Encryption);

        cacheWorker = global.omnihive.getWorker<ICacheWorker | undefined>(HiveWorkerType.Cache);
        dateWorker = global.omnihive.getWorker<IDateWorker | undefined>(HiveWorkerType.Date);

        return { logWorker, databaseWorker, knex, encryptionWorker, cacheWorker, dateWorker };
    };

    /**
     * Verify the access token provided is valid
     *
     * @param omniHiveContext GraphQL Custom Headers
     * @returns { Promise<void> }
     */
    public verifyToken = async (omniHiveContext: GraphContext): Promise<void> => {
        // Retrieve the token worker
        const tokenWorker: ITokenWorker | undefined = global.omnihive.getWorker<ITokenWorker | undefined>(
            HiveWorkerType.Token
        );

        // Gather the security flag
        let disableSecurity: boolean =
            global.omnihive.getEnvironmentVariable<boolean>("OH_SECURITY_DISABLE_TOKEN_CHECK") ?? false;

        // If security is enabled and no worker is found then throw an error
        if (!disableSecurity && !tokenWorker) {
            throw new Error("[ohAccessError] No token worker defined.");
        }

        // If security is enabled but the access token is blank then throw an error
        if (!disableSecurity && tokenWorker && !omniHiveContext?.access) {
            throw new Error("[ohAccessError] Access token is invalid or expired.");
        }

        // If security is enabled and the access token is provided then verify the token
        if (!disableSecurity && tokenWorker && omniHiveContext?.access) {
            const verifyToken: boolean = await AwaitHelper.execute(tokenWorker.verify(omniHiveContext.access));

            // If the token is invalid then throw an error
            if (!verifyToken) {
                throw new Error("[ohAccessError] Access token is invalid or expired.");
            }
        }
    };
}
