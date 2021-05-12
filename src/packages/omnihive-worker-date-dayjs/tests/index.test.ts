import { assert } from "chai";
import dayjs from "dayjs";
import DayJsDateWorker from "..";
import { TestConfigSettings } from "../../../tests/models/TestConfigSettings";
import { TestService } from "../../../tests/services/TestService";
import packageJson from "../package.json";

const testService = new TestService();
const {
    workers: [config],
} = <TestConfigSettings>testService.getTestConfig(packageJson.name);
const worker = new DayJsDateWorker();

const mockDate = dayjs("2020-01-01T00:00:00").toDate();

describe("date worker tests", () => {
    describe("init functions", () => {
        it("test init", async () => {
            await worker.init(config);
            assert.isObject(worker.config);
        });
    });
    describe("worker functions", () => {
        it("convert between timezones", () => {
            const result = worker.convertDateBetweenTimezones(mockDate, "Asia/Tokyo", "America/New_York");
            const diff = dayjs(result).diff(mockDate, "hour");
            assert.equal(diff, 14);
        });
        it("convert between timezones - invalid from", () => {
            assert.throws(
                () => worker.convertDateBetweenTimezones(mockDate, "Bad timezone", "America/New_York"),
                /Could not convert timezones/
            );
        });
        it("convert between timezones - invalid to", () => {
            assert.throws(
                () => worker.convertDateBetweenTimezones(mockDate, "Asia/Tokyo", "Bad timezone"),
                /Could not convert timezones/
            );
        });
        it("convert between timezones - no from timezone", () => {
            const result = worker.convertDateBetweenTimezones(mockDate, "Asia/Tokyo");
            const diff = dayjs(result).diff(mockDate, "hour");
            assert.equal(diff, 14);
        });
        it("format date", () => {
            const dateString = worker.getFormattedDateString(mockDate, "MM/DD/YYYY hh:mma");
            assert.equal(dateString, "01/01/2020 12:00am");
        });
        it("format date - no format specified", () => {
            const dateString = worker.getFormattedDateString(mockDate);
            assert.equal(dateString, "2020-01-01T00:00:00");
        });
    });
});
