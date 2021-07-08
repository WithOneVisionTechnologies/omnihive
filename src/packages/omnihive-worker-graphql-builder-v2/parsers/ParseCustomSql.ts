import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { GraphContext } from "@withonevision/omnihive-core/models/GraphContext";
import { WorkerHelper } from "../helpers/WorkerHelper";

export class ParseCustomSql {
    /**
     * Parse the encrypted sql into a graph result
     *
     * @param workerName
     * @param encryptedSql
     * @param omniHiveContext
     * @returns { Promise<any[][]> }
     */
    public parse = async (
        workerName: string,
        encryptedSql: string,
        omniHiveContext: GraphContext
    ): Promise<any[][]> => {
        try {
            // Set the required worker values
            const workerHelper: WorkerHelper = new WorkerHelper();
            const { databaseWorker, encryptionWorker } = workerHelper.getRequiredWorkers(workerName);

            // If the database worker does not exist then throw an error
            if (!databaseWorker) {
                throw new Error(
                    "Database Worker Not Defined.  This graph converter will not work without a Database worker."
                );
            }

            // If the encryption worker does not exist then throw an error
            if (!encryptionWorker) {
                throw new Error(
                    "Encryption Worker Not Defined.  This graph converter with Cache worker enabled will not work without an Encryption worker."
                );
            }

            // Verify the authenticity of the access token
            await AwaitHelper.execute(workerHelper.verifyToken(omniHiveContext));

            // Decrypt the given encrypted sql
            const decryptedSql = encryptionWorker.symmetricDecrypt(encryptedSql);

            // Run the decrypted query
            return await AwaitHelper.execute(databaseWorker.executeQuery(decryptedSql));
        } catch (err) {
            throw err;
        }
    };
}
