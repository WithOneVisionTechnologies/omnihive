import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { PubSubListener } from "@withonevision/omnihive-core/models/PubSubListener";
import { assert } from "chai";
import { serializeError } from "serialize-error";
import PusherJsPubSubClientWorker from "..";
import { TestConfigSettings } from "../../../tests/models/TestConfigSettings";
import { TestService } from "../../../tests/services/TestService";
import packageJson from "../package.json";

let settings: TestConfigSettings;
let worker: PusherJsPubSubClientWorker = new PusherJsPubSubClientWorker();
const testService: TestService = new TestService();

describe("pubsub client worker tests", function () {
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

        const channelName: string = "jest-test-channel";
        const eventName: string = "jest-test-event";
        const message: string = "I clicked it, it works!";

        const verifyStartState = (addListener: boolean = false): void => {
            try {
                worker.connect();

                if (addListener) {
                    worker.addListener(channelName, eventName, function (msg: string) {
                        assert.equal(msg, message);
                    });
                }
            } catch (err) {
                throw new Error("setup error: " + JSON.stringify(serializeError(err)));
            }
        };

        it("connect", function () {
            assert.doesNotThrow(worker.connect);
        });

        it("join channel", function () {
            verifyStartState();

            assert.doesNotThrow(function () {
                worker.joinChannel(channelName);
            });
        });

        it("leave channel", function () {
            verifyStartState(true);

            assert.doesNotThrow(function () {
                worker.leaveChannel(channelName);
            });
        });

        it("add listener", function () {
            verifyStartState();

            assert.doesNotThrow(function () {
                worker.addListener(channelName, eventName);
            });
        });

        it("remove listener", function () {
            verifyStartState(true);

            assert.doesNotThrow(function () {
                worker.removeListener(channelName, eventName);
            });
        });

        it("get channels", function () {
            verifyStartState(true);

            const channels = worker.getJoinedChannels();

            assert.equal(channels[0], channelName);
        });

        it("get listeners", function () {
            verifyStartState(true);

            const listeners = worker.getListeners();
            const retrievedValues = listeners.map((x: PubSubListener) => ({
                channelName: x.channelName,
                eventName: x.eventName,
            }));
            const verifiedValue = {
                channelName,
                eventName,
            };

            assert.equal(retrievedValues[0].channelName, verifiedValue.channelName);
            assert.equal(retrievedValues[0].eventName, verifiedValue.eventName);
        });

        it("disconnect", function () {
            verifyStartState();

            assert.doesNotThrow(worker.disconnect);
        });

        // TODO: Test with server to verify emits are heard.
    });
});
