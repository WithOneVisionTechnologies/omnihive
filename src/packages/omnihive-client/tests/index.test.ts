import { TestConfigSettings } from "../../../tests/models/TestConfigSettings";
import { TestService } from "../../../tests/services/TestService";
import packageJson from "../package.json";
import { OmniHiveClient } from "../index";
import { assert } from "chai";
import { ClientSettings } from "@withonevision/omnihive-core/models/ClientSettings";

let settings: TestConfigSettings;
const testService: TestService = new TestService();

describe("client tests", function () {
    before(function () {
        const config: TestConfigSettings | undefined = testService.getTestConfig(packageJson.name);

        if (!config) {
            this.skip();
        }

        testService.clearWorkers();
        settings = config;
    });

    describe("init tests", function () {
        it("get new", function () {
            assert.instanceOf(OmniHiveClient.getNew(), OmniHiveClient);
        });

        it("get singleton", function () {
            assert.instanceOf(OmniHiveClient.getSingleton(), OmniHiveClient);
        });

        it("init", async function () {
            const clientSettings: ClientSettings = {
                rootUrl: testService.serverSettings.config.webRootUrl,
                tokenMetadata: {
                    audience: testService.getConstants()["ohTokenAudience"],
                    secret: testService.getConstants()["ohTokenSecret"],
                    expires: testService.getConstants()["ohTokenExpiresIn"],
                    hashAlgorithm: testService.getConstants()["ohTokenHashAlgorithm"],
                    verify: true,
                },
            };

            assert.doesNotThrow(async () => await OmniHiveClient.getSingleton().init(clientSettings));
        });
    });

    describe("graph tests", function () {});

    describe("auth token tests", function () {
        it("set auth token", async function () {
            OmniHiveClient.getSingleton().setAccessToken(settings.constants["testAuthToken"]);
            assert.equal(OmniHiveClient.getSingleton().accessToken, settings.constants["testAuthToken"]);
        });
    });
});
