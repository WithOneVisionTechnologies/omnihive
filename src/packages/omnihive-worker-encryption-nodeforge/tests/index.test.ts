import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { assert } from "chai";
import NodeForgeEncryptionWorker from "..";
import { TestConfigSettings } from "../../../tests/models/TestConfigSettings";
import { TestService } from "../../../tests/services/TestService";
import packageJson from "../package.json";

let settings: TestConfigSettings;
let worker: NodeForgeEncryptionWorker = new NodeForgeEncryptionWorker();
const testService: TestService = new TestService();

describe("encryption worker tests", function () {
    before(function () {
        const config: TestConfigSettings | undefined = testService.getTestConfig(packageJson.name);

        if (!config) {
            this.skip();
        }

        testService.clearWorkers();
        settings = config;
    });

    const init = async function (): Promise<void> {
        await AwaitHelper.execute(testService.initWorkers(settings.workers));
        const newWorker: any = testService.registeredWorkers.find((x: any) => x.package === packageJson.name);

        if (newWorker && newWorker.instance) {
            worker = newWorker.instance;
        }
    };

    describe("Init functions", function () {
        it("test init", async function () {
            const result = await AwaitHelper.execute(init());
            assert.isUndefined(result);
        });
    });

    describe("Worker Functions", function () {
        before(async function () {
            await AwaitHelper.execute(init());
        });

        it("base64 - encrypt", function () {
            const result = worker.base64Encode(settings.constants["encryptionMessage"]);
            assert.equal(result, settings.constants["base64Encrypted"]);
        });

        it("base64 - decrypt", function () {
            const result = worker.base64Decode(settings.constants["base64Encrypted"]);
            assert.equal(result, settings.constants["encryptionMessage"]);
        });

        it("symmetric - encrypt", function () {
            const encryptString = settings.constants["encryptionMessage"];
            const encrypted = worker.symmetricEncrypt(encryptString);
            const result = worker.symmetricDecrypt(encrypted);

            assert.notEqual(encrypted, encryptString);
            assert.notEqual(encrypted, settings.constants["symetricEncrypted"]);
            assert.equal(result, encryptString);
        });

        it("symmetric - decrypt", function () {
            const testString = settings.constants["symetricEncrypted"];
            const result = worker.symmetricDecrypt(testString);
            assert.equal(result, settings.constants["encryptionMessage"]);
        });

        it("symmetric - decrypt - invalid - format", function () {
            try {
                worker.symmetricDecrypt("invalid-format");
                assert.fail("Failed Test");
            } catch (err) {
                assert.equal(err.message, "Secure message data is not in the correct format");
            }
        });

        it("symmetric - decrypt - empty - iv", function () {
            try {
                worker.symmetricDecrypt(settings.constants["encryptionInvalidIvLength"]);
                assert.fail("Failed Test");
            } catch (err) {
                assert.equal(err.message, "Secure message symmetric iv not in the correct format");
            }
        });

        it("symmetric - decrypt - invalid - iv", function () {
            try {
                worker.symmetricDecrypt(settings.constants["encryptionInvalidIv"]);
                assert.fail("Failed Test");
            } catch (err) {
                assert.equal(err.message, "Secure message symmetric iv not in the correct format");
            }
        });

        it("symmetric - decrypt - invalid - data packet", function () {
            try {
                worker.symmetricDecrypt(settings.constants["encryptionInvalidDataPacket"]);
                assert.fail("Failed Test");
            } catch (err) {
                assert.equal(err.message, "Secure message data packet not in the correct format");
            }
        });

        it("symmetric - decrypt - invalid - key", function () {
            try {
                worker.config.metadata.encryptionKey =
                    "Invalid Data Key Format that is too long. Invalid Data Key Format that is too long. Invalid Data Key Format that is too long.";
                worker.init(worker.config);

                worker.symmetricDecrypt(settings.constants["symetricEncrypted"]);
                assert.fail("Failed Test");
            } catch (err) {
                assert.equal(err.message, "Secure message symmetric key not in the correct format");
            }
        });
    });
});
