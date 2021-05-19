import { assert } from "chai";
import { LifecycleWorkerAction } from "../enums/LifecycleWorkerAction";
import { LifecycleWorkerStage } from "../enums/LifecycleWorkerStage";
import { RestMethod } from "../enums/RestMethod";
import { AuthUser } from "../models/AuthUser";
import { ConnectionSchema } from "../models/ConnectionSchema";
import { ConverterSqlInfo } from "../models/ConverterSqlInfo";
import { GraphContext } from "../models/GraphContext";
import { HiveWorker } from "../models/HiveWorker";
import { HiveWorkerBase } from "../models/HiveWorkerBase";
import { HiveWorkerMetadataDatabase } from "../models/HiveWorkerMetadataDatabase";
import { HiveWorkerMetadataGraphBuilder } from "../models/HiveWorkerMetadataGraphBuilder";
import { HiveWorkerMetadataLifecycleFunction } from "../models/HiveWorkerMetadataLifecycleFunction";
import { HiveWorkerMetadataRestFunction } from "../models/HiveWorkerMetadataRestFunction";
import { HiveWorkerMetadataServer } from "../models/HiveWorkerMetadataServer";
import { PubSubListener } from "../models/PubSubListener";
import { RegisteredHiveWorker } from "../models/RegisteredHiveWorker";
import { RegisteredUrl } from "../models/RegisteredUrl";
import { RestEndpointExecuteResponse } from "../models/RestEndpointExecuteResponse";
import { ServerSettings } from "../models/ServerSettings";
import { ProcFunctionSchema } from "../models/ProcFunctionSchema";
import { TableSchema } from "../models/TableSchema";
import { WorkerGetterBase } from "../models/WorkerGetterBase";
import { WorkerSetterBase } from "../models/WorkerSetterBase";

class TestAbstractHiveWorkerBase extends HiveWorkerBase {
    public baseInit;

    constructor() {
        super();
        this.baseInit = super.init;
    }
}

class TestAbstractGetterBase extends WorkerGetterBase {
    public baseGetWorker;

    constructor() {
        super();
        this.baseGetWorker = super.getWorker;
    }
}

class TestAbstractSetterBase extends WorkerSetterBase {
    public baseInitWorkers;
    public basePushWorker;

    constructor() {
        super();
        this.baseInitWorkers = super.initWorkers;
        this.basePushWorker = super.pushWorker;
    }
}

describe("model tests", function () {
    it("AuthUser", function () {
        const test = new AuthUser();

        assert.isTrue(test.address === "", "address not initialized properly");
        assert.isTrue(test.email === "", "email not initialized properly");
        assert.isTrue(test.firstName === "", "firstName not initialized properly");
        assert.isTrue(test.fullName === "", "fullName not initialized properly");
        assert.isTrue(test.lastName === "", "lastName not initialized properly");
        assert.isTrue(test.nickname === "", "nickname not initialized properly");
        assert.isTrue(test.phoneNumber === "", "phoneNumber not initialized properly");
    });

    it("ConnectionSchema", function () {
        const test = new ConnectionSchema();

        assert.isTrue(test.workerName === "", "workerName not initialized properly");
        assert.isTrue(Array.isArray(test.tables), "tables not initialized properly");
        assert.isTrue(test.tables.length === 0, "tables array over populated when initialized");
        assert.isTrue(Array.isArray(test.procFunctions), "procs not initialized properly");
        assert.isTrue(test.procFunctions.length === 0, "procs array is over populated when initialized");
    });

    it("ConverterSqlInfo", function () {
        const test = new ConverterSqlInfo();

        assert.isTrue(
            Object.entries(test.hydrationDefinition).length === 0,
            "hydrationDefinition not initialized properly"
        );
        assert.isTrue(test.sql === "", "sql not initialized properly");
        assert.isTrue(test.workerName === "", "workerName not initialized properly");
    });

    it("GraphContext", function () {
        const test = new GraphContext();

        assert.isTrue(test.access === undefined, "access not initialized properly");
        assert.isTrue(test.auth === undefined, "auth not initialized properly");
        assert.isTrue(test.cache === undefined, "cache not initialized properly");
        assert.isTrue(test.cacheSeconds === undefined, "cacheSeconds not initialized properly");
    });

    describe("GraphQLJSON Functions", function () {});

    it("HiveWorker", function () {
        const test = new HiveWorker();

        assert.isTrue(test.type === "", "type not initialized properly");
        assert.isTrue(test.name === "", "name not initialized properly");
        assert.isTrue(test.package === "", "package not initialized properly");
        assert.isTrue(test.version === "", "version not initialized properly");
        assert.isTrue(test.importPath === "", "importPath not initialized properly");
        assert.isTrue(test.default, "default not initialized properly");
        assert.isTrue(test.enabled, "enabled not initialized properly");
        assert.isTrue(test.metadata === undefined, "metadata not initialized properly");
    });

    it("HiveWorkerBase", function () {
        const test = new TestAbstractHiveWorkerBase();

        assert.isTrue(test.serverSettings === undefined, "serverSettings not initialized properly");
        assert.isTrue(test.config === undefined, "config not initialized properly");
        assert.isTrue(
            typeof test.checkObjectStructure === "function",
            "checkObjectStructure function not initialized properly"
        );
        assert.isTrue(typeof test.baseInit === "function", "init function not initialized properly");
        assert.isTrue(Array.isArray(test.registeredWorkers), "registeredWorkers not initialized properly");
        assert.isTrue(
            test.registeredWorkers.length === 0,
            "registeredWorkers array is over populated when initialized"
        );
    });

    it("HiveWorkerMetadataDatabase", function () {
        const test = new HiveWorkerMetadataDatabase();

        assert.isTrue(test.databaseName === "", "databaseName not initialized properly");
        assert.isTrue(test.password === "", "password not initialized properly");
        assert.isTrue(test.rowLimit === 0, "rowLimit not initialized properly");
        assert.isTrue(test.serverAddress === "", "serverAddress not initialized properly");
        assert.isTrue(test.serverPort === 0, "serverPort not initialized properly");
        assert.isTrue(test.urlRoute === "", "urlRoute not initialized properly");
        assert.isTrue(test.userName === "", "userName not initialized properly");
    });

    it("HiveWorkerMetadataGraphBuilder", function () {
        const test = new HiveWorkerMetadataGraphBuilder();

        assert.isTrue(Array.isArray(test.dbWorkers), "dbWorkers not initialized properly");
        assert.isTrue(test.dbWorkers.length === 0, "dbWorkers array is over populated when initialized");
        assert.isTrue(test.urlRoute === "", "urlRoute not initialized properly");
    });

    it("HiveWorkerMetadataLifecycleFunction", function () {
        const test = new HiveWorkerMetadataLifecycleFunction();

        assert.isTrue(test.lifecycleAction === LifecycleWorkerAction.None, "lifecycleAction not initialized properly");
        assert.isTrue(test.lifecycleStage === LifecycleWorkerStage.None, "lifecycleState not initialized properly");
        assert.isTrue(test.lifecycleOrder === 0, "lifecycleOrder not initialized properly");
        assert.isTrue(test.lifecycleWorker === "", "lifecycleWorker not initialized properly");
        assert.isTrue(Array.isArray(test.lifecycleTables), "lifecycleTables not initialized properly");
        assert.isTrue(test.lifecycleTables.length === 0, "lufecycleTables array is over populated when initialized");
    });

    it("HiveWorkerMetadataRestFunction", function () {
        const test = new HiveWorkerMetadataRestFunction();

        assert.isTrue(test.restMethod === RestMethod.POST, "restMethod not initialized properly");
        assert.isTrue(test.urlRoute === "", "urlRoute not initialized properly");
    });

    it("HiveWorkerMetadataServer", function () {
        const test = new HiveWorkerMetadataServer();

        assert.isTrue(Array.isArray(test.buildWorkers), "buildWorkers not initialized properly");
        assert.isTrue(test.buildWorkers.length === 0, "buildWorkers array is over populated when initialized");
        assert.isTrue(test.urlRoute === "", "urlRoute not initialized properly");
    });

    it("PubSubListener", function () {
        const test = new PubSubListener();

        assert.isTrue(test.channelName === "", "channelName not initialized properly");
        assert.isTrue(test.eventName === "", "eventName not initialized properly");
        assert.isTrue(test.callback === undefined, "callback not initialized properly");
    });

    it("RegisteredHiveWorker", function () {
        const test = new RegisteredHiveWorker();

        assert.isTrue(test.instance === undefined, "instance not initialized properly");
        assert.isTrue(test.isBoot === false, "isBoot not initialized properly");
        assert.isTrue(test.isCore === false, "isCore not initialized properly");
        assert.isTrue(test.type === "", "type not initialized properly");
        assert.isTrue(test.name === "", "name not initialized properly");
        assert.isTrue(test.package === "", "package not initialized properly");
        assert.isTrue(test.version === "", "version not initialized properly");
        assert.isTrue(test.importPath === "", "importPath not initialized properly");
        assert.isTrue(test.default, "default not initialized properly");
        assert.isTrue(test.enabled, "enabled not initialized properly");
        assert.isTrue(test.metadata === undefined, "metadata not initialized properly");
    });

    it("RegisteredUrl", function () {
        const test = new RegisteredUrl();

        assert.isTrue(test.path === "", "path not initialized properly");
        assert.isTrue(test.type === "", "type not initialized properly");
        assert.isTrue(Object.entries(test.metadata).length === 0, "metadata not initialized properly");
    });

    it("RestEndpointExecuteResponse", function () {
        const test = new RestEndpointExecuteResponse();

        assert.isTrue(test.response === undefined, "response not initialized properly");
        assert.isTrue(test.status === 200, "status not initialized properly");
    });

    it("ServerSettings", function () {
        const test = new ServerSettings();

        assert.isTrue(Object.entries(test.constants).length === 0, "constants not initialized properly");
        assert.isTrue(Object.entries(test.features).length === 0, "features not initialized properly");
        assert.isTrue(Array.isArray(test.workers), "workers not initialized properly");
        assert.isTrue(test.workers.length === 0, "workers array is over populated when initialized");
    });

    it("ProcFunctionSchema", function () {
        const test = new ProcFunctionSchema();

        assert.isTrue(test.schemaName === "", "schema not initialized properly");
        assert.isTrue(test.name === "", "name not initialized properly");
        assert.isTrue(test.parameterOrder === 0, "parameterOrder not initialized properly");
        assert.isTrue(test.parameterName === "", "parameterName not initialized properly");
        assert.isTrue(test.parameterTypeDatabase === "", "parameterTypeDatabase not initialized properly");
        assert.isTrue(test.parameterTypeEntity === "", "parameterTypeEntity not initialized properly");
    });

    it("TableSchema", function () {
        const test = new TableSchema();

        assert.isTrue(test.tableName === "", "tableName not initialized properly");
        assert.isTrue(test.tableNameCamelCase === "", "tableNameCamelCase not initialized properly");
        assert.isTrue(test.tableNamePascalCase === "", "tableNamePascalCase not initialized properly");
        assert.isTrue(test.columnNameDatabase === "", "columnNameDatabase not initialized properly");
        assert.isTrue(test.columnNameEntity === "", "columnNameEntity not initialized properly");
        assert.isTrue(test.columnTypeDatabase === "", "columnTypeDatabase not initialized properly");
        assert.isTrue(test.columnTypeEntity === "", "columnTypeEntity not initialized properly");
        assert.isTrue(test.columnPosition === 0, "columnPosition not initialized properly");
        assert.isTrue(test.columnIsNullable === true, "columnIsNullable not initialized properly");
        assert.isTrue(test.columnIsIdentity === false, "columnIsIdentity not initialized properly");
        assert.isTrue(test.columnIsPrimaryKey === false, "columnIsPrimaryKey not initialized properly");
        assert.isTrue(test.columnIsForeignKey === false, "columnIsForeignKey not initialized properly");
        assert.isTrue(test.columnForeignKeyTableName === "", "columnForeignKeyTableName not initialized properly");
        assert.isTrue(
            test.columnForeignKeyTableNameCamelCase === "",
            "columnForeignKeyTableNameCamelCase not initialized properly"
        );
        assert.isTrue(
            test.columnForeignKeyTableNamePascalCase === "",
            "columnForeignKeyTableNamePascalCase not initialized properly"
        );
        assert.isTrue(test.columnForeignKeyColumnName === "", "columnForeignKeyColumnName");
    });

    it("WorkerGetterBase", function () {
        const test = new TestAbstractGetterBase();

        assert.isTrue(Array.isArray(test.registeredWorkers), "registeredWorkers not initialized properly");
        assert.isTrue(
            test.registeredWorkers.length === 0,
            "registeredWorkers array is over populated when initialized"
        );
        assert.isTrue(typeof test.baseGetWorker === "function", "getWorker function not initialized properly");
    });

    it("WorkerSetterBase", function () {
        const test = new TestAbstractSetterBase();

        assert.isTrue(
            Object.entries(test.serverSettings.constants).length === 0,
            "serverSettings.constants not initialized properly"
        );
        assert.isTrue(
            Object.entries(test.serverSettings.features).length === 0,
            "serverSettings.features not initialized properly"
        );
        assert.isTrue(Array.isArray(test.serverSettings.workers), "serverSettings.workers not initialized properly");
        assert.isTrue(
            test.serverSettings.workers.length === 0,
            "serverSettings.workers array over populated when initialized"
        );

        assert.isTrue(typeof test.baseInitWorkers === "function", "initWorkers function not initialized properly");
        assert.isTrue(typeof test.basePushWorker === "function", "pushWorker function not initialized properly");
        assert.isTrue(Array.isArray(test.registeredWorkers), "registeredWorkers not initialized properly");
        assert.isTrue(test.registeredWorkers.length === 0, "registeredWorkers array over populated when initialized");
    });
});
