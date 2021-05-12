import "jsdom-global/register";

import { assert } from "chai";
import CrossStorageWorker from "..";
import { TestConfigSettings } from "../../../tests/models/TestConfigSettings";
import { TestService } from "../../../tests/services/TestService";
import packageJson from "../package.json";
import { WorkerGetterBase } from "@withonevision/omnihive-core/models/WorkerGetterBase";
import sinon from "sinon";
import { CrossStorageClient } from "cross-storage";

import EncryptionWorker from "../../omnihive-worker-encryption-nodeforge";

const testService = new TestService();
const {
    workers: [config],
} = <TestConfigSettings>testService.getTestConfig(packageJson.name);
const worker = new CrossStorageWorker();
const uninitializedWorker = new CrossStorageWorker();

describe("cross storage worker tests", () => {
    afterEach(() => {
        sinon.restore();
    });
    describe("init functions", () => {
        it("test init", async () => {
            await worker.init(config);
            assert.isObject(worker.config);
        });
    });
    describe("worker functions", () => {
        it("exists - not initialized", async () => {
            try {
                await uninitializedWorker.exists("ping");
                assert.fail("Method expected to fail, but didn't");
            } catch (err) {
                assert.equal(err.message, "Client store has not been initialized.  Please call initialize first");
            }
        });
        it("exists - no encryption worker", async () => {
            try {
                await worker.exists("ping");
                assert.fail("Method expected to fail, but didn't");
            } catch (err) {
                assert.equal(
                    err.message,
                    "Encryption Worker Not Defined.  Cross-Storage Will Not Function Without Encryption Worker."
                );
            }
        });
        it("does not exist", async () => {
            sinon.stub(WorkerGetterBase.prototype, "getWorker").returns(new EncryptionWorker());
            sinon.stub(CrossStorageClient.prototype, "onConnect").resolves();
            const result = await worker.exists("ping");
            assert.equal(result, false);
        });
        it("exists", async () => {
            sinon.stub(WorkerGetterBase.prototype, "getWorker").returns(new EncryptionWorker());
            sinon.stub(CrossStorageClient.prototype, "onConnect").resolves();
            sinon.stub(CrossStorageClient.prototype, "get").resolves(["pong"]);
            const result = await worker.exists("ping");
            assert.equal(result, true);
        });
        it("get - not initialized", async () => {
            try {
                await uninitializedWorker.get("ping");
                assert.fail("Method expected to fail, but didn't");
            } catch (err) {
                assert.equal(err.message, "Client store has not been initialized.  Please call initialize first");
            }
        });
        it("get - no encryption worker", async () => {
            try {
                await worker.get("ping");
                assert.fail("Method expected to fail, but didn't");
            } catch (err) {
                assert.equal(
                    err.message,
                    "Encryption Worker Not Defined.  Cross-Storage Will Not Function Without Encryption Worker."
                );
            }
        });
        it("remove - not initialized", async () => {
            try {
                await uninitializedWorker.remove("ping");
                assert.fail("Method expected to fail, but didn't");
            } catch (err) {
                assert.equal(err.message, "Client store has not been initialized.  Please call initialize first");
            }
        });
        it("set - not initialized", async () => {
            try {
                await uninitializedWorker.set("ping", "pong");
                assert.fail("Method expected to fail, but didn't");
            } catch (err) {
                assert.equal(err.message, "Client store has not been initialized.  Please call initialize first");
            }
        });
        it("set - no encryption worker", async () => {
            try {
                await worker.set("ping", "pong");
                assert.fail("Method expected to fail, but didn't");
            } catch (err) {
                assert.equal(
                    err.message,
                    "Encryption Worker Not Defined.  Cross-Storage Will Not Function Without Encryption Worker."
                );
            }
        });
    });
});
