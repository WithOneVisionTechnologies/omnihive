import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";
import { IEncryptionWorker } from "@withonevision/omnihive-core/interfaces/IEncryptionWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import forge from "node-forge";

export class NodeForgeEncryptionWorkerMetadata {
    public encryptionKey: string = "";
    public randomCharacters: number = 5;
}

export default class NodeForgeEncryptionWorker extends HiveWorkerBase implements IEncryptionWorker {
    private typedMetadata!: NodeForgeEncryptionWorkerMetadata;

    constructor() {
        super();
    }

    public async init(name: string, metadata?: any): Promise<void> {
        await AwaitHelper.execute(super.init(name, metadata));
        this.typedMetadata = this.checkObjectStructure<NodeForgeEncryptionWorkerMetadata>(
            NodeForgeEncryptionWorkerMetadata,
            metadata
        );
    }

    public base64Encode = (toEncode: string): string => {
        toEncode = `${toEncode}${this.generateRandomCharacters()}`;
        const bytes: string = forge.util.encodeUtf8(toEncode);
        const encoded: string = forge.util.encode64(bytes);
        return encoded;
    };

    public base64Decode = (toDecode: string): string => {
        const decodedBytes: string = forge.util.decode64(toDecode);
        const decoded: string = forge.util.decodeUtf8(decodedBytes);
        return decoded.substring(0, decoded.length - this.typedMetadata.randomCharacters);
    };

    public symmetricDecrypt = (message: string): string => {
        // Split message to get iv and data
        let iv: string;
        let data: string | forge.util.ByteStringBuffer | ArrayBuffer | forge.util.ArrayBufferView;
        let decodedKey: string | forge.util.ByteStringBuffer;
        let decipher: forge.cipher.BlockCipher;

        // Validate message format
        if (
            IsHelper.isNullOrUndefined(message) ||
            IsHelper.isEmptyStringOrWhitespace(message) ||
            message.indexOf(":") < 0
        ) {
            throw new Error("Secure message data is not in the correct format");
        }

        const messageParts: any[] | string[] = message.split(":");

        let uint8 = forge.util.binary.base64.decode(messageParts[0]);
        iv = "";

        for (var i = 0; i < uint8.byteLength; i++) {
            iv += String.fromCharCode(uint8[i]);
        }

        try {
            let uint8 = forge.util.binary.base64.decode(messageParts[1]);
            data = "";

            for (var i = 0; i < uint8.byteLength; i++) {
                data += String.fromCharCode(uint8[i]);
            }

            if (IsHelper.isNullOrUndefined(data)) {
                throw new Error("Secure message data packet not in the correct format");
            }
        } catch (e) {
            throw new Error("Secure message data packet not in the correct format");
        }

        try {
            decodedKey = forge.util.createBuffer(forge.util.binary.base64.decode(this.typedMetadata.encryptionKey));
            decipher = forge.cipher.createDecipher("AES-CBC", decodedKey);
        } catch (e) {
            throw new Error("Secure message symmetric key not in the correct format");
        }

        // Create and execute decipher
        try {
            decipher.start({ iv });
        } catch (err) {
            throw new Error("Secure message symmetric iv not in the correct format");
        }

        decipher.update(forge.util.createBuffer(data));
        decipher.finish();

        // Get decrypted message
        const decrypted = decipher.output.data;
        return decrypted.substring(0, decrypted.length - this.typedMetadata.randomCharacters);
    };

    public symmetricEncrypt = (message: string): string => {
        message = `${message}${this.generateRandomCharacters()}`;

        // Get random iv
        const iv = forge.random.getBytesSync(16);
        const encodedIv = forge.util.encode64(iv);

        // Create and execute cipher
        const cipher = forge.cipher.createCipher("AES-CBC", forge.util.decode64(this.typedMetadata.encryptionKey));

        cipher.start({ iv });
        cipher.update(forge.util.createBuffer(message));
        cipher.finish();

        // Build message
        message = encodedIv + ":" + forge.util.encode64(cipher.output.data);
        return message;
    };

    private generateRandomCharacters = (): string => {
        const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

        let result = "";
        const charactersLength = characters.length;
        for (let i = 0; i < this.typedMetadata.randomCharacters; i++) {
            result += characters.charAt(Math.floor(Math.random() * charactersLength));
        }

        return result;
    };
}
