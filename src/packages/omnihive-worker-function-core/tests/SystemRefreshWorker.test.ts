import { WorkerGetterBase } from "@withonevision/omnihive-core/models/WorkerGetterBase";
import { assert } from "chai";
import sinon from "sinon";
import { TestService } from "../../../tests/services/TestService";
import { TestConfigSettings } from "../../../tests/models/TestConfigSettings";

import TokenWorker from "../../omnihive-worker-token-jsonwebtoken";
import SystemRefreshWorker from "../SystemRefreshWorker";

const worker = new SystemRefreshWorker();
worker.serverSettings = {
    constants: {},
    features: {},
    workers: [],
    config: {
        adminPassword: "correctPassword",
        adminPortNumber: 9999,
        nodePortNumber: 9999,
        webRootUrl: "http://mock.example.com",
    },
};

const testService = new TestService();
const tokenWorker = new TokenWorker();
const {
    workers: [config],
} = <TestConfigSettings>testService.getTestConfig("@withonevision/omnihive-worker-token-jsonwebtoken");
tokenWorker.init(config);

describe("system refresh worker tests", () => {
    afterEach(() => {
        sinon.restore();
    });
    describe("worker functions", () => {
        it("execute - no token worker", async () => {
            try {
                await worker.execute(undefined, "", undefined);
                assert.fail("Method expected to fail, but didn't");
            } catch (err) {
                assert.equal(err.message, "Token Worker cannot be found");
            }
        });
        it("execute - no headers", async () => {
            sinon.stub(WorkerGetterBase.prototype, "getWorker").returns(tokenWorker);
            const result = await worker.execute(undefined, "", undefined);
            assert.equal(result.status, 400);
            assert.nestedPropertyVal(result.response, "error.message", "Request Denied");
        });
        it("execute - no body", async () => {
            sinon.stub(WorkerGetterBase.prototype, "getWorker").returns(tokenWorker);
            const result = await worker.execute({ ohAccess: "mockToken" }, "", undefined);
            assert.equal(result.status, 400);
            assert.nestedPropertyVal(result.response, "error.message", "Request Denied");
        });
        it("execute - no ohAccess token", async () => {
            sinon.stub(WorkerGetterBase.prototype, "getWorker").returns(tokenWorker);
            const result = await worker.execute({ mockHeader: "mockValue" }, "", {});
            assert.equal(result.status, 400);
            assert.nestedPropertyVal(result.response, "error.message", "[ohAccessError] Token Invalid");
        });
        it("execute - no admin password", async () => {
            sinon.stub(WorkerGetterBase.prototype, "getWorker").returns(tokenWorker);
            const result = await worker.execute({ ohAccess: "mockToken" }, "", {});
            assert.equal(result.status, 400);
            assert.nestedPropertyVal(result.response, "error.message", "Request Denied");
        });
        it("execute - incorrect admin password", async () => {
            sinon.stub(WorkerGetterBase.prototype, "getWorker").returns(tokenWorker);
            sinon.stub(worker, "checkObjectStructure").returns({ adminPassword: "mockPassword" });
            const result = await worker.execute({ ohAccess: "mockToken" }, "", { adminPassword: "mockPassword" });
            assert.equal(result.status, 400);
            assert.nestedPropertyVal(result.response, "error.message", "Request Denied");
        });
        it("execute", async () => {
            sinon.stub(WorkerGetterBase.prototype, "getWorker").returns(tokenWorker);
            sinon.stub(worker, "checkObjectStructure").returns({ adminPassword: "correctPassword" });
            const result = await worker.execute({ ohAccess: "mockToken" }, "", { adminPassword: "correctPassword" });
            assert.equal(result.status, 200);
            console.log(result.response);
            assert.nestedPropertyVal(result.response, "message", "Server Refresh/Reset Initiated");
        });
        it("getSwaggerDefinition", () => {
            const result = worker.getSwaggerDefinition();
            assert.isObject(result?.definitions);
            assert.isObject(result?.paths);
        });
    });
});