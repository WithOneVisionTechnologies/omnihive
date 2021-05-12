import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { assert } from "chai";
import { serializeError } from "serialize-error";
import SentryErrorWorker from "..";
import { TestConfigSettings } from "../../../tests/models/TestConfigSettings";
import { TestService } from "../../../tests/services/TestService";
import packageJson from "../package.json";

let settings: TestConfigSettings;
let worker: SentryErrorWorker = new SentryErrorWorker();
const testService: TestService = new TestService();

describe("sentry error worker tests", function () {
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
            const result = await init();
            assert.isUndefined(result);
        });
    });

    describe("Worker Functions", function () {
        before(async function () {
            await init();
        });

        it("handle exception", function () {
            try {
                worker.handleException("OmniHive Test Error");
            } catch (err) {
                throw new Error("sentry error handle exception error => " + JSON.stringify(serializeError(err)));
            }
        });
    });
});
