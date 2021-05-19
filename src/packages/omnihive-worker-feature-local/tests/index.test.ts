import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { ServerSettings } from "@withonevision/omnihive-core/models/ServerSettings";
import { assert } from "chai";
import LocalFeatureWorker from "..";

const mockServerSettings: ServerSettings = {
    features: { mockFeature: "mockFeatureValue" },
    constants: {},
    config: {
        adminPassword: "mockPassword",
        adminPortNumber: 9999,
        nodePortNumber: 9999,
        webRootUrl: "mockUrl",
    },
    workers: [],
};

const worker = new LocalFeatureWorker();
worker.serverSettings = mockServerSettings;

describe("local feature worker tests", () => {
    describe("worker functions", () => {
        it("get", async () => {
            const result = await AwaitHelper.execute(worker.get("mockFeature"));
            assert.equal(result, "mockFeatureValue");
        });
        it("get - no name", async () => {
            try {
                await AwaitHelper.execute(worker.get(""));
                assert.fail("Method expected to fail, but didn't");
            } catch (err) {
                assert.equal(err.message, "No feature name given.");
            }
        });
        it("get - default value", async () => {
            const result = await AwaitHelper.execute(worker.get("nonexistentFeature", "defaultValue"));
            assert.equal(result, "defaultValue");
        });
        it("get - does not exist", async () => {
            const result = await AwaitHelper.execute(worker.get("nonexistentFeature"));
            assert.equal(result, undefined);
        });
    });
});
