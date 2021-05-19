import { HiveWorkerType } from "@withonevision/omnihive-core/enums/HiveWorkerType";
import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { ProcFunctionSchema } from "@withonevision/omnihive-core/models/ProcFunctionSchema";
import { assert } from "chai";
import MssqlDatabaseWorker from "..";
import { TestConfigSettings } from "../../../tests/models/TestConfigSettings";
import { TestService } from "../../../tests/services/TestService";
import packageJson from "../package.json";

let settings: TestConfigSettings;
let worker: MssqlDatabaseWorker = new MssqlDatabaseWorker();
const testService: TestService = new TestService();

describe("mssql database worker tests", function () {
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

    const sleep = async function (milliseconds: number): Promise<void> {
        return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
    };

    describe("Worker Functions", function () {
        const wipeData = async function (): Promise<void> {
            const schema: ProcFunctionSchema = new ProcFunctionSchema();
            schema.schemaName = "dbo";
            schema.name = "test_truncate_mocha_testing";
            await AwaitHelper.execute(worker.executeProcedure([schema], []));
        };

        before(async function () {
            await AwaitHelper.execute(init());
            await AwaitHelper.execute(sleep(1000));
        });

        beforeEach(async function () {
            await AwaitHelper.execute(wipeData());
        });

        afterEach(async function () {
            await AwaitHelper.execute(wipeData());
        });

        const executeQuery = async () => {
            const proc = `
                insert into dbo.mocha_testing (
                    [data]
                )
                values (
                    'Testing Values 1'
                );

                select jt.[data]
                from dbo.mocha_testing as jt;
            `;
            return await AwaitHelper.execute(worker.executeQuery(proc));
        };

        it("execute query", async function () {
            const result = await AwaitHelper.execute(executeQuery());

            assert.strictEqual(result[0][0].data, "Testing Values 1");
        });

        it("execute procedure", async function () {
            const schema: ProcFunctionSchema = new ProcFunctionSchema();
            schema.schemaName = "dbo";
            schema.name = "test_stored_proc_call";
            const result = await AwaitHelper.execute(
                worker.executeProcedure(
                    [schema],
                    [
                        { name: "Value", value: "Testing Values ", isString: true },
                        { name: "Numeric", value: 1, isString: false },
                    ]
                )
            );

            assert.equal(result[0][0].data, "Testing Values 1");
        });

        it("execute procedure with no schema", async function () {
            const schema: ProcFunctionSchema = new ProcFunctionSchema();
            schema.name = "test_stored_proc_call";
            const result = await AwaitHelper.execute(
                worker.executeProcedure(
                    [schema],
                    [
                        { name: "Value", value: "Testing Values ", isString: true },
                        { name: "Numeric", value: 1, isString: false },
                    ]
                )
            );

            assert.equal(result[0][0].data, "Testing Values 1");
        });

        it("get schema", async function () {
            const results = await AwaitHelper.execute(worker.getSchema());

            assert.equal(results.tables[0].tableName, "mocha_testing");
            assert.equal(results.procFunctions.length, 5);
        });

        it("execute query - no log worker", async function () {
            worker.registeredWorkers = worker.registeredWorkers.filter((x) => x.type !== HiveWorkerType.Log);
            const result = await AwaitHelper.execute(executeQuery());

            assert.strictEqual(result[0][0].data, "Testing Values 1");
        });
    });
});
