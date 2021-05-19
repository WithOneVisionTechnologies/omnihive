import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { assert } from "chai";
import CacheNodeCacheWorker from "..";
import { TestConfigSettings } from "../../../tests/models/TestConfigSettings";
import { TestService } from "../../../tests/services/TestService";
import packageJson from "../package.json";

const testService = new TestService();
const {
    workers: [config],
} = <TestConfigSettings>testService.getTestConfig(packageJson.name);
const worker = new CacheNodeCacheWorker();

const mockKey = "ping";
const mockValue = "pong";
const mockTimeout = 5000;

describe("cache (node) worker tests", () => {
    describe("init functions", () => {
        it("test init", async () => {
            await AwaitHelper.execute(worker.init(config));
            assert.isObject(worker.config);
        });
    });
    describe("worker functions", () => {
        beforeEach(async () => {
            const exists = await AwaitHelper.execute(worker.exists(mockKey));
            if (exists) await AwaitHelper.execute(worker.remove(mockKey));
        });
        it("does not exist", async () => {
            const result = await AwaitHelper.execute(worker.exists(mockKey));
            assert.equal(result, false);
        });
        it("set/get cache", async () => {
            await AwaitHelper.execute(worker.set(mockKey, mockValue, mockTimeout));
            const result = await AwaitHelper.execute(worker.get(mockKey));
            assert.equal(result, mockValue);
        });
        it("get nonexistant cache", async () => {
            const result = await AwaitHelper.execute(worker.get(mockKey));
            assert.equal(result, undefined);
        });
        it("delete cache", async () => {
            await AwaitHelper.execute(worker.set(mockKey, mockValue, mockTimeout));
            await AwaitHelper.execute(worker.remove(mockKey));
            const result = await AwaitHelper.execute(worker.exists(mockKey));
            assert.equal(result, false);
        });
    });
});
