import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { AuthUser } from "@withonevision/omnihive-core/models/AuthUser";
import { assert } from "chai";
import { serializeError } from "serialize-error";
import AuthZeroUserWorker from "..";
import { TestConfigSettings } from "../../../tests/models/TestConfigSettings";
import { TestService } from "../../../tests/services/TestService";
import packageJson from "../package.json";

let settings: TestConfigSettings;
let worker: AuthZeroUserWorker = new AuthZeroUserWorker();
const testService: TestService = new TestService();

describe("user worker tests", function () {
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
            const result = await AwaitHelper.execute(init());
            assert.isUndefined(result);
        });
    });

    describe("Worker Functions", function () {
        before(async function () {
            await AwaitHelper.execute(init());
        });

        const validateStartCondition = async function (createTest: boolean = false): Promise<void> {
            const userId: string | undefined = await AwaitHelper.execute(
                worker.getUserIdByEmail("test1@withone.vision")
            );

            if (createTest && userId) {
                await AwaitHelper.execute(worker.delete(userId));
            } else if (!createTest && !userId) {
                try {
                    await AwaitHelper.execute(worker.create("test1@withone.vision", "$r0ngPa$$w0rd"));
                } catch (err) {
                    throw new Error("create failure: " + serializeError(JSON.stringify(err)));
                }
            }
        };

        const validateResults = function (account: AuthUser) {
            if (account) {
                const validate: any = account?.email;

                assert.strictEqual(validate, "test1@withone.vision");
            } else {
                throw new Error("Validation Failed");
            }

            return account;
        };

        it("Create User", async function () {
            await AwaitHelper.execute(validateStartCondition(true));

            let account: AuthUser;

            try {
                account = await AwaitHelper.execute(worker.create("test1@withone.vision", "$r0ngPa$$w0rd"));
            } catch (err) {
                throw new Error("create failure: " + serializeError(JSON.stringify(err)));
            }

            validateResults(account);
        });

        it("Get User", async function () {
            await AwaitHelper.execute(validateStartCondition());

            let account: AuthUser;

            try {
                account = await AwaitHelper.execute(worker.get("test1@withone.vision"));
            } catch (err) {
                throw new Error("get failure: " + serializeError(JSON.stringify(err)));
            }

            validateResults(account);
        });

        it("Login User", async function () {
            await AwaitHelper.execute(validateStartCondition());

            let account: AuthUser;

            try {
                account = await AwaitHelper.execute(worker.login("test1@withone.vision", "$r0ngPa$$w0rd"));
            } catch (err) {
                throw new Error("login failure: " + serializeError(JSON.stringify(err)));
            }

            validateResults(account);
        });

        it("Password Change Request", async function () {
            await AwaitHelper.execute(validateStartCondition());

            let results: boolean = false;

            try {
                results = await AwaitHelper.execute(worker.passwordChangeRequest("test1@withone.vision"));
            } catch (err) {
                throw new Error("password change request failure: " + serializeError(JSON.stringify(err)));
            }

            assert.isOk(results);
        });

        it("Update User", async function () {
            await AwaitHelper.execute(validateStartCondition());

            let account: AuthUser;
            const updateUser: AuthUser = new AuthUser();
            updateUser.firstName = "Awesome";
            updateUser.lastName = "Tester";
            updateUser.nickname = "Unstoppable";
            updateUser.fullName = "Unstoppable Tester";

            try {
                account = await AwaitHelper.execute(worker.update("test1@withone.vision", updateUser));
            } catch (err) {
                throw new Error("update failure: " + serializeError(JSON.stringify(err)));
            }

            assert.deepEqual(account, updateUser);
        });

        it("Get UserId By Email", async function () {
            await AwaitHelper.execute(validateStartCondition());

            let results: string | undefined;

            try {
                results = await AwaitHelper.execute(worker.getUserIdByEmail("test1@withone.vision"));
            } catch (err) {
                throw new Error("get userId by email failure: " + serializeError(JSON.stringify(err)));
            }

            assert.isOk(results);
        });

        it("Delete User", async function () {
            await AwaitHelper.execute(validateStartCondition());

            let results: string = "";

            try {
                const id: string | undefined = await AwaitHelper.execute(
                    worker.getUserIdByEmail("test1@withone.vision")
                );

                if (id) {
                    results = await AwaitHelper.execute(worker.delete(id));
                }
            } catch (err) {
                throw new Error("update failure: " + serializeError(JSON.stringify(err)));
            }

            assert.strictEqual(results, "User successfully deleted");
        });
    });
});
