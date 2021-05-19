import { WorkerGetterBase } from "@withonevision/omnihive-core/models/WorkerGetterBase";
import { assert } from "chai";
import sinon from "sinon";
import { TestService } from "../../../tests/services/TestService";
import { TestConfigSettings } from "../../../tests/models/TestConfigSettings";
import objectHash from "object-hash";

import TokenWorker from "../../omnihive-worker-token-jsonwebtoken";
import SystemAccessTokenWorker from "../SystemAccessTokenWorker";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";

const worker = new SystemAccessTokenWorker();

const testService = new TestService();
const tokenWorker = new TokenWorker();
const {
    workers: [config],
} = <TestConfigSettings>testService.getTestConfig("@withonevision/omnihive-worker-token-jsonwebtoken");
tokenWorker.init(config);

describe("system access token worker tests", () => {
    afterEach(() => {
        sinon.restore();
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
        it("execute - no parameters", async () => {
            sinon.stub(tokenWorker, "get").resolves("mockToken");
            sinon.stub(WorkerGetterBase.prototype, "getWorker").returns(tokenWorker);
            const result = await AwaitHelper.execute(worker.execute(undefined, "", undefined));
            assert.equal(result.status, 400);
            assert.nestedPropertyVal(result.response, "error.message", "Request must have parameters");
        });
        it("execute - no match", async () => {
            sinon.stub(tokenWorker, "get").resolves("mockToken");
            sinon.stub(WorkerGetterBase.prototype, "getWorker").returns(tokenWorker);
            const result = await AwaitHelper.execute(worker.execute(undefined, "", { generator: "mockGenerator" }));
            assert.equal(result.status, 400);
            assert.nestedPropertyVal(result.response, "error.message", "Token cannot be generated");
        });
        it("execute", async () => {
            sinon.stub(tokenWorker, "get").resolves("mockToken");
            sinon.stub(WorkerGetterBase.prototype, "getWorker").returns(tokenWorker);
            const result = await AwaitHelper.execute(
                worker.execute(undefined, "", {
                    generator: objectHash(config.metadata, { algorithm: config.metadata.hashAlgorithm }),
                })
            );
            assert.equal(result.status, 200);
            assert.nestedProperty(result.response, "token");
        });
        it("getSwaggerDefinition", () => {
            const result = worker.getSwaggerDefinition();
            assert.isObject(result?.definitions);
            assert.isObject(result?.paths);
        });
    });
});
