import sinon from "sinon";
import LogWorkerServerDefault from "..";
import { OmniHiveLogLevel } from "@withonevision/omnihive-core/enums/OmniHiveLogLevel";

const worker = new LogWorkerServerDefault();

describe("default log worker tests", () => {
    before(async () => {
        global.omnihive = {
            adminServer: undefined!,
            appServer: undefined!,
            bootLoaderSettings: undefined!,
            bootWorkerNames: undefined!,
            commandLineArgs: undefined!,
            getWorker: undefined!,
            initWorkers: undefined!,
            ohDirName: undefined!,
            pushWorker: undefined!,
            registeredSchemas: undefined!,
            registeredWorkers: undefined!,
            registeredUrls: undefined!,
            serverError: undefined!,
            serverStatus: undefined!,
            serverSettings: undefined!,
            webServer: undefined!,
        };
    });
    afterEach(() => {
        sinon.restore();
    });
    after(() => {
        global.omnihive = {
            adminServer: undefined!,
            appServer: undefined!,
            bootLoaderSettings: undefined!,
            bootWorkerNames: undefined!,
            commandLineArgs: undefined!,
            getWorker: undefined!,
            initWorkers: undefined!,
            ohDirName: undefined!,
            pushWorker: undefined!,
            registeredSchemas: undefined!,
            registeredWorkers: undefined!,
            registeredUrls: undefined!,
            serverError: undefined!,
            serverStatus: undefined!,
            serverSettings: undefined!,
            webServer: undefined!,
        };
    });
    describe("worker functions", () => {
        it("write - info", async () => {
            worker.write(OmniHiveLogLevel.Info, "Don't Panic.");
        });
        it("write - warn", async () => {
            worker.write(OmniHiveLogLevel.Warn, "Mostly Harmless.");
        });
        it("write - error", async () => {
            worker.write(OmniHiveLogLevel.Error, "So Long, and Thanks for All the Fish.");
        });

        // TODO: test registered workers
    });
});
