import { assert } from "chai";
import CacheRedisWorker from "..";
import { TestConfigSettings } from "../../../tests/models/TestConfigSettings";
import { TestService } from "../../../tests/services/TestService";
import packageJson from "../package.json";
import sinon from "sinon";
import ioredis from "ioredis";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";

const testService = new TestService();
const {
    workers: [config],
} = <TestConfigSettings>testService.getTestConfig(packageJson.name);
const worker = new CacheRedisWorker();

describe("cache (redis) worker tests", () => {
    afterEach(() => {
        sinon.restore();
    });
    describe("init functions", () => {
        it("test init", async () => {
            const stubConnect = sinon.stub(ioredis.prototype, "connect").returns(Promise.resolve());
            await AwaitHelper.execute(worker.init(config));
            assert.equal(stubConnect.calledOnce, true);
            assert.isObject(worker.config);
        });
        it("test init - invalid connection string", async () => {
            const stubConnect = sinon.stub(ioredis.prototype, "connect").throws();
            try {
                await AwaitHelper.execute(worker.init(config));
                assert.fail("Method expected to fail, but didn't");
            } catch (err) {
                assert.typeOf(err, "Error");
            }
            assert.equal(stubConnect.calledOnce, true);
        });
    });
    describe("worker functions", () => {
        it("does not exist", async () => {
            const stubRedisExists = sinon.stub(ioredis.prototype, "exists").returns(Promise.resolve(1));
            const result = await AwaitHelper.execute(worker.exists("ping"));
            assert.equal(result, true);
            assert.equal(stubRedisExists.calledOnce, true);
            stubRedisExists.reset();
        });
        it("set/get cache", async () => {
            const stubSet = sinon.stub(ioredis.prototype, "set");
            const stubGet = sinon.stub(ioredis.prototype, "get").returns(Promise.resolve("pong"));
            await AwaitHelper.execute(worker.set("ping", "pong", 5000));
            const result = await AwaitHelper.execute(worker.get("ping"));
            assert.equal(stubSet.calledOnce, true);
            assert.equal(stubGet.calledOnce, true);
            assert.equal(result, "pong");
        });
        it("get nonexistent cache", async () => {
            const stubGet = sinon.stub(ioredis.prototype, "get").returns(Promise.resolve(null));
            const result = await AwaitHelper.execute(worker.get("ping"));
            assert.equal(stubGet.calledOnce, true);
            assert.equal(result, undefined);
        });
        it("delete cache", async () => {
            const stubDel = sinon.stub(ioredis.prototype, "del").returns(Promise.resolve());
            const result = await AwaitHelper.execute(worker.remove("ping"));
            assert.equal(stubDel.calledOnce, true);
            assert.equal(result, true);
        });
    });
});
