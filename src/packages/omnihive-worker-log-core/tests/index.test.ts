import sinon from "sinon";
import LogWorkerServerDefault from "..";
import { OmniHiveLogLevel } from "@withonevision/omnihive-core/enums/OmniHiveLogLevel";
import ws from "ws";

const worker = new LogWorkerServerDefault();

const mockServer = new ws.Server({ port: 65535 });
const testPort = mockServer.options.port;
const mockClient = new ws(`ws://localhost:${testPort}`, {});
mockClient.on("close", () => {
    mockClient.close();
});

describe("default log worker tests", () => {
    before(async () => {
        global.omnihive = {
            adminServer: mockServer,
            adminServerTimer: undefined!,
            appServer: undefined!,
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
        mockServer.close();

        global.omnihive = {
            adminServer: undefined!,
            adminServerTimer: undefined!,
            appServer: undefined!,
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
