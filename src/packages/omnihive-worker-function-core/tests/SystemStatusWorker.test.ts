import { WorkerGetterBase } from "@withonevision/omnihive-core/models/WorkerGetterBase";
import { assert } from "chai";
import sinon from "sinon";
import { TestService } from "../../../tests/services/TestService";
import { TestConfigSettings } from "../../../tests/models/TestConfigSettings";

import TokenWorker from "../../omnihive-worker-token-jsonwebtoken";
import SystemStatusWorker from "../SystemStatusWorker";
import { ServerStatus } from "@withonevision/omnihive-core/enums/ServerStatus";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";

const worker = new SystemStatusWorker();
worker.serverSettings = {
    constants: {},
    features: {},
    workers: [],
};

const testService = new TestService();
const tokenWorker = new TokenWorker();
const {
    workers: [config],
} = <TestConfigSettings>testService.getTestConfig("@withonevision/omnihive-worker-token-jsonwebtoken");
tokenWorker.init(config);

describe("system status worker tests", () => {
    before(() => {
        global.omnihive = {
            adminServer: undefined!,
            appServer: undefined!,
            bootLoaderSettings: undefined!,
            bootWorkerNames: undefined!,
            commandLineArgs: undefined!,
            getWorker: undefined!,
            initWorkers: undefined!,
            ohDirName: undefined!,
            pushWorker: undefined!,
            registeredSchemas: undefined!,
            registeredWorkers: undefined!,
            registeredUrls: undefined!,
            serverError: undefined!,
            serverStatus: undefined!,
            serverSettings: undefined!,
            webServer: undefined!,
        };
    });
    afterEach(() => {
        sinon.restore();
    });
    after(() => {
        global.omnihive = {
            adminServer: undefined!,
            appServer: undefined!,
            bootLoaderSettings: undefined!,
            bootWorkerNames: undefined!,
            commandLineArgs: undefined!,
            getWorker: undefined!,
            initWorkers: undefined!,
            ohDirName: undefined!,
            pushWorker: undefined!,
            registeredSchemas: undefined!,
            registeredWorkers: undefined!,
            registeredUrls: undefined!,
            serverError: undefined!,
            serverStatus: undefined!,
            serverSettings: undefined!,
            webServer: undefined!,
        };
    });
    describe("worker functions", () => {
        it("execute - no token worker", async () => {
            try {
                await AwaitHelper.execute(worker.execute(undefined, "", undefined));
                assert.fail("Method expected to fail, but didn't");
            } catch (err) {
                assert.equal(err.message, "Token Worker cannot be found");
            }
        });
        it("execute - no headers", async () => {
            sinon.stub(WorkerGetterBase.prototype, "getWorker").returns(tokenWorker);
            const result = await AwaitHelper.execute(worker.execute(undefined, "", undefined));
            assert.equal(result.status, 400);
            assert.nestedPropertyVal(result.response, "error.message", "Request Denied");
        });
        it("execute - no body", async () => {
            sinon.stub(WorkerGetterBase.prototype, "getWorker").returns(tokenWorker);
            const result = await AwaitHelper.execute(worker.execute({ ohAccess: "mockToken" }, "", undefined));
            assert.equal(result.status, 400);
            assert.nestedPropertyVal(result.response, "error.message", "Request Denied");
        });
        it("execute - no ohAccess token", async () => {
            sinon.stub(WorkerGetterBase.prototype, "getWorker").returns(tokenWorker);
            const result = await AwaitHelper.execute(worker.execute({ mockHeader: "mockValue" }, "", {}));
            assert.equal(result.status, 400);
            assert.nestedPropertyVal(result.response, "error.message", "[ohAccessError] Token Invalid");
        });
        it("execute - no admin password", async () => {
            sinon.stub(WorkerGetterBase.prototype, "getWorker").returns(tokenWorker);
            const result = await AwaitHelper.execute(worker.execute({ ohAccess: "mockToken" }, "", {}));
            assert.equal(result.status, 400);
            assert.nestedPropertyVal(result.response, "error.message", "Request Denied");
        });
        it("execute - incorrect admin password", async () => {
            sinon.stub(WorkerGetterBase.prototype, "getWorker").returns(tokenWorker);
            sinon.stub(worker, "checkObjectStructure").returns({ adminPassword: "mockPassword" });
            const result = await AwaitHelper.execute(
                worker.execute({ ohAccess: "mockToken" }, "", { adminPassword: "mockPassword" })
            );
            assert.equal(result.status, 400);
            assert.nestedPropertyVal(result.response, "error.message", "Request Denied");
        });
        it("execute", async () => {
            sinon.stub(WorkerGetterBase.prototype, "getWorker").returns(tokenWorker);
            sinon.stub(worker, "checkObjectStructure").returns({ adminPassword: "correctPassword" });
            const result = await AwaitHelper.execute(
                worker.execute({ ohAccess: "mockToken" }, "", { adminPassword: "correctPassword" })
            );
            assert.equal(result.status, 200);
            assert.nestedPropertyVal(result.response, "status", ServerStatus.Online);
            assert.nestedPropertyVal(result.response, "error", undefined);
        });
        it("getSwaggerDefinition", () => {
            const result = worker.getSwaggerDefinition();
            assert.isObject(result?.definitions);
            assert.isObject(result?.paths);
        });
    });
});
