import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IEncryptionWorker } from "@withonevision/omnihive-core/interfaces/IEncryptionWorker";
import { IStorageWorker } from "@withonevision/omnihive-core/interfaces/IStorageWorker";
import { HiveWorker } from "@withonevision/omnihive-core/models/HiveWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import { CrossStorageClient, CrossStorageClientOptions } from "cross-storage";
export class CrossStorageStorageWorkerMetadata {
    public hubLocation: string = "";
    public keyPrefix: string = "";
}

export default class CrossStorageWorker extends HiveWorkerBase implements IStorageWorker {
    private storageClient: CrossStorageClient | undefined = undefined;
    private metadata!: CrossStorageStorageWorkerMetadata;

    constructor() {
        super();
    }

    public async init(config: HiveWorker): Promise<void> {
        await AwaitHelper.execute(super.init(config));
        this.metadata = this.checkObjectStructure<CrossStorageStorageWorkerMetadata>(
            CrossStorageStorageWorkerMetadata,
            config.metadata
        );

        const options: CrossStorageClientOptions = {};
        const storage = new CrossStorageClient(this.metadata.hubLocation, options);
        this.storageClient = storage;
    }

    public exists = (key: string): Promise<boolean> => {
        const promise: Promise<boolean> = new Promise<boolean>((resolve, _reject) => {
            if (!this.storageClient) {
                throw new Error("Client store has not been initialized.  Please call initialize first");
            }

            const encryptionWorker = this.getWorker<IEncryptionWorker | undefined>(HiveWorkerType.Encryption);

            if (!encryptionWorker) {
                throw new Error(
                    "Encryption Worker Not Defined.  Cross-Storage Will Not Function Without Encryption Worker."
                );
            }

            this.storageClient
                .onConnect()
                .then(() => {
                    if (!this.storageClient) {
                        throw new Error("Client store has not been initialized.  Please call initialize first");
                    }

                    this.storageClient
                        .get(`${this.metadata.keyPrefix}::${key}`)
                        .then((_res: string) => resolve(true))
                        .catch(() => resolve(false));
                })
                .catch(() => {
                    return new Error("Cannot connect to cross-storage hub.");
                });
        });

        return promise;
    };

    public get = <T extends unknown>(key: string): Promise<T | undefined> => {
        const promise: Promise<T | undefined> = new Promise<T | undefined>((resolve, _reject) => {
            if (!this.storageClient) {
                throw new Error("Client store has not been initialized.  Please call initialize first");
            }

            const encryptionWorker = this.getWorker<IEncryptionWorker | undefined>(HiveWorkerType.Encryption);

            if (!encryptionWorker) {
                throw new Error(
                    "Encryption Worker Not Defined.  Cross-Storage Will Not Function Without Encryption Worker."
                );
            }

            this.storageClient
                .onConnect()
                .then(() => {
                    if (!this.storageClient) {
                        throw new Error("Client store has not been initialized.  Please call initialize first");
                    }

                    this.storageClient
                        .get(`${this.metadata.keyPrefix}::${key}`)
                        .then((res: string) => {
                            // Get the value and decrypt it
                            const decrypted: string = encryptionWorker.symmetricDecrypt(res);

                            // Return the value
                            resolve(JSON.parse(decrypted));
                        })
                        .catch(() => resolve(undefined));
                })
                .catch(() => {
                    return new Error("Cannot connect to cross-storage hub.");
                });
        });

        return promise;
    };

    public remove = (key: string): Promise<boolean> => {
        const promise: Promise<boolean> = new Promise<boolean>((resolve, _reject) => {
            if (!this.storageClient) {
                throw new Error("Client store has not been initialized.  Please call initialize first");
            }

            this.storageClient
                .onConnect()
                .then(() => {
                    if (!this.storageClient) {
                        throw new Error("Client store has not been initialized.  Please call initialize first");
                    }

                    this.storageClient
                        .del(`${this.metadata.keyPrefix}::${key}`)
                        .then(() => resolve(true))
                        .catch(() => resolve(false));
                })
                .catch(() => {
                    return new Error("Cannot connect to cross-storage hub.");
                });
        });

        return promise;
    };

    public set = <T extends unknown>(key: string, model: T): Promise<boolean> => {
        const promise: Promise<boolean> = new Promise<boolean>((resolve, _reject) => {
            if (!this.storageClient) {
                throw new Error("Client store has not been initialized.  Please call initialize first");
            }

            const encryptionWorker = this.getWorker<IEncryptionWorker | undefined>(HiveWorkerType.Encryption);

            if (!encryptionWorker) {
                throw new Error(
                    "Encryption Worker Not Defined.  Cross-Storage Will Not Function Without Encryption Worker."
                );
            }

            this.storageClient
                .onConnect()
                .then(() => {
                    if (!this.storageClient) {
                        throw new Error("Client store has not been initialized.  Please call initialize first");
                    }

                    // Stringify the value and encrypt it
                    const json: string = JSON.stringify(model);
                    let encrypted: string = "";

                    if (json !== "") {
                        encrypted = encryptionWorker.symmetricEncrypt(json);
                    }

                    // Set the item
                    this.storageClient
                        .set(`${this.metadata.keyPrefix}::${key}`, encrypted)
                        .then(() => resolve(true))
                        .catch(() => resolve(false));
                })
                .catch(() => {
                    return new Error("Cannot connect to cross-storage hub.");
                });
        });

        return promise;
    };
}
