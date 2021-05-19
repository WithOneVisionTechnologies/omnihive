import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { assert } from "chai";
import LaunchDarklyNodeFeatureWorker from "..";
import { TestConfigSettings } from "../../../tests/models/TestConfigSettings";
import { TestService } from "../../../tests/services/TestService";
import packageJson from "../package.json";

let settings: TestConfigSettings;
let worker: LaunchDarklyNodeFeatureWorker = new LaunchDarklyNodeFeatureWorker();
const testService: TestService = new TestService();

describe("feature worker tests", function () {
    before(function () {
        const config: TestConfigSettings | undefined = testService.getTestConfig(packageJson.name);

        if (!config) {
            this.skip();
        }

        testService.clearWorkers();
        settings = config;
    });

    after(function () {
        if (worker.isConnected()) {
            worker.disconnect();
        }
    });

    beforeEach(async function () {
        if (!worker.isConnected()) {
            await AwaitHelper.execute(init());
        }
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

        it("get feature - blank - with default", async function () {
            try {
                await AwaitHelper.execute(worker.get("", false));

                assert.fail("Expected to fail");
            } catch (err) {
                assert.equal(err.message, "No feature name given.");
            }
        });

        it("isConnected", function () {
            assert.isTrue(worker.isConnected());
        });

        it("Disconnect", async function () {
            await AwaitHelper.execute(worker.disconnect());
            assert.isFalse(worker.isConnected());
        });
    });
});
