import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { assert } from "chai";
import path from "path";
import FileSystemWorker from "..";
import { TestConfigSettings } from "../../../tests/models/TestConfigSettings";
import { TestService } from "../../../tests/services/TestService";
import packageJson from "../package.json";

let settings: TestConfigSettings;
let worker: FileSystemWorker = new FileSystemWorker();
const testService: TestService = new TestService();

describe("file system worker tests", function () {
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
            const result = await AwaitHelper.execute<void>(init());
            assert.isUndefined(result);
        });
    });

    describe("Worker Functions", function () {
        before(async function () {
            await init();
        });

        let fileDirPath: string = "";
        let fileExePath: string = "";
        let testFolderPath: string = "";

        beforeEach(function () {
            fileDirPath = worker.getCurrentFileDirectory();
            fileExePath = worker.getCurrentExecutionDirectory();

            testFolderPath = path.join(fileDirPath, "tests", "testing-folder");

            worker.ensureFolderExists(testFolderPath);

            worker.removeFilesFromDirectory(testFolderPath);

            const testData: any = {
                data: "This test will be awesome!",
            };
            worker.writeJsonToFile(path.join(testFolderPath, "test-file.json"), testData);
        });

        afterEach(function () {
            worker.removeDirectory(testFolderPath);
            worker.removeDirectory(path.join(fileDirPath, "test-copy-directory"));
        });

        it("Get current directory", function () {
            const path: string = worker.getCurrentFileDirectory();
            assert.isTrue(path.includes("packages/omnihive-worker-filesystem-fsextra"));
            assert.equal(path, fileDirPath);
        });

        it("Get execution directory", function () {
            const path: string = worker.getCurrentExecutionDirectory();
            assert.equal(path, fileExePath);
        });

        it("Directory has files", function () {
            const results: boolean = worker.directoryHasFiles("./");
            assert.isTrue(results);
        });

        it("Read files from directory", function () {
            const results: string[] = worker.readFileNamesFromDirectory(testFolderPath);
            assert.deepEqual(results, ["test-file.json"]);
        });

        it("Read file", function () {
            const rawResult: string = worker.readFile(path.join(testFolderPath, "test-file.json"));
            const results: any = JSON.parse(rawResult);
            assert.equal(results.data, "This test will be awesome!");
        });

        it("Ensure folder exists", function () {
            worker.ensureFolderExists(testFolderPath);
            const result: boolean = worker.pathExists(testFolderPath);
            assert.isTrue(result);
        });

        it("Remove file", function () {
            worker.removeFile(path.join(testFolderPath, "test-file.json"));
            const result: string[] = worker.readFileNamesFromDirectory(testFolderPath);
            assert.deepEqual(result, []);
        });

        it("Remove files in directory", function () {
            worker.removeFilesFromDirectory(testFolderPath);
            const result: string[] = worker.readFileNamesFromDirectory(testFolderPath);
            assert.deepEqual(result, []);
        });

        it("Remove directory", function () {
            worker.removeDirectory(testFolderPath);
            const result: boolean = worker.pathExists(testFolderPath);
            assert.isFalse(result);
        });

        it("Write data to file", function () {
            const singlePath: string = path.join(testFolderPath, "write-data-test.text");
            const data: string = "Write this string to a file please!";
            worker.writeDataToFile(singlePath, data);

            // Verify file creation
            const exists: boolean = worker.pathExists(singlePath);
            assert.isTrue(exists);

            // Verify file content
            const result: string = worker.readFile(singlePath);
            assert.deepEqual(result, data);
        });

        it("Write data to file", function () {
            const singlePath: string = path.join(testFolderPath, "write-data-test.json");
            const testingString: string = "This will be yet another awesome test!!";
            const data: any = {
                data: testingString,
            };
            worker.writeJsonToFile(singlePath, data);

            // Verify file creation
            const exists: boolean = worker.pathExists(singlePath);
            assert.isTrue(exists);

            // Verify file content
            const rawResult: string = worker.readFile(singlePath);
            const results: any = JSON.parse(rawResult);
            assert.equal(results.data, testingString);
        });

        it("Copy File", function () {
            const source: string = path.join(testFolderPath, "test-file.json");
            const dest: string = path.join(testFolderPath, "test-copy-file.json");
            worker.copyFile(source, dest);

            const result: boolean = worker.pathExists(dest);
            assert.isTrue(result);
        });

        it("Copy Directory", function () {
            const sourceFiles: string[] = worker.readFileNamesFromDirectory(testFolderPath);
            const dest: string = path.join(fileDirPath, "test-copy-directory");
            worker.copyDirectory(testFolderPath, dest);

            const result: string[] = worker.readFileNamesFromDirectory(dest);
            assert.deepEqual(result, sourceFiles);
        });
    });
});
