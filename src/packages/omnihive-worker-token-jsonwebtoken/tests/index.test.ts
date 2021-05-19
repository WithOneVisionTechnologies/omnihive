import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { assert } from "chai";
import { serializeError } from "serialize-error";
import AuthZeroTokenWorker from "..";
import { TestConfigSettings } from "../../../tests/models/TestConfigSettings";
import { TestService } from "../../../tests/services/TestService";
import packageJson from "../package.json";

let settings: TestConfigSettings;
let worker: AuthZeroTokenWorker = new AuthZeroTokenWorker();
const testService: TestService = new TestService();
let token: string = "";

describe("token worker tests", function () {
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

        const verifyStartState = async function (): Promise<void> {
            if (token && token.length > 0) {
                try {
                    const check = await worker.expired(token);

                    if (!check) {
                        token = await AwaitHelper.execute<string>(worker.get());
                    } else {
                        const verified = await AwaitHelper.execute<boolean>(worker.verify(token));

                        if (!verified) {
                            token = await AwaitHelper.execute<string>(worker.get());
                        }
                    }
                } catch (_err) {
                    token = await AwaitHelper.execute<string>(worker.get());
                }
            } else {
                token = await AwaitHelper.execute<string>(worker.get());
            }
        };

        it("Get Token", async function () {
            try {
                token = await AwaitHelper.execute<string>(worker.get());

                assert.isTrue(token && token.length > 0);
            } catch (err) {
                throw new Error("get token error: " + JSON.stringify(serializeError(err)));
            }
        });

        it("Get Token - after token is retrieved", async function () {
            try {
                await AwaitHelper.execute<string>(worker.get());
                token = await AwaitHelper.execute<string>(worker.get());

                assert.isTrue(token && token.length > 0);
            } catch (err) {
                throw new Error("get token error: " + JSON.stringify(serializeError(err)));
            }
        });

        it("Check Expired Token - Valid Token", async function () {
            try {
                await verifyStartState();
                const expired = await worker.expired(token);

                assert.isFalse(expired);
            } catch (err) {
                throw new Error("check expired token error: " + JSON.stringify(serializeError(err)));
            }
        });

        it("Check Expired Token - Expired Token", async function () {
            try {
                const tempToken = "blah";

                const expired = await worker.expired(tempToken);

                assert.isTrue(expired);
            } catch (err) {
                assert.isFalse(true);
            }
        });

        it("Check Expired Token - Invalid Token", async function () {
            try {
                const tempToken = "";

                const expired = await worker.expired(tempToken);

                assert.isTrue(expired);
            } catch (err) {
                assert.equal(err.message, "[ohAccessError] Access token is either the wrong client or expired");
            }
        });

        it("Verify Token", async function () {
            try {
                const results = await AwaitHelper.execute<boolean>(worker.verify(token));

                assert.isTrue(results);
            } catch (err) {
                throw new Error("verify token error: " + JSON.stringify(serializeError(err)));
            }
        });

        it("Verify Token - null token", async function () {
            try {
                const invalid = await AwaitHelper.execute<boolean>(worker.verify(""));

                assert.isFalse(invalid);
            } catch (err) {
                assert.equal(err.message, "No access token was given");
            }
        });

        it("Verify Token - single space token", async function () {
            try {
                const invalid = await AwaitHelper.execute<boolean>(worker.verify(" "));

                assert.isFalse(invalid);
            } catch (err) {
                assert.equal(err.message, "No access token was given");
            }
        });

        it("Verify Token - expired token", async function () {
            try {
                const expired = await AwaitHelper.execute<boolean>(worker.verify("blah"));

                assert.isFalse(expired);
            } catch (err) {
                assert.equal(err.message, "Signature verification failed");
            }
        });

        it("Verify Token - mismatching client", async function () {
            try {
                worker.config.metadata.audience = "";
                await AwaitHelper.execute(worker.init(worker.config));
                const invalid = await AwaitHelper.execute<boolean>(worker.verify(""));

                assert.isFalse(invalid);
            } catch (err) {
                assert.equal(err.message, "Signature verification failed");
                //"No audience granted");
            }
        });

        it("Verify Token - verify turned off", async function () {
            try {
                worker.config.metadata.verifyOn = false;
                await AwaitHelper.execute(worker.init(worker.config));
                const results = await AwaitHelper.execute<boolean>(worker.verify(""));

                assert.isTrue(results);
            } catch (err) {
                throw new Error("Verify Token - Verify Turned Off Error => " + JSON.stringify(serializeError(err)));
            }
        });
    });
});
