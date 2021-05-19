import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IDateWorker } from "@withonevision/omnihive-core/interfaces/IDateWorker";
import { HiveWorker } from "@withonevision/omnihive-core/models/HiveWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import dayjs from "dayjs";
import tz from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

export class DayJsDateWorkerMetadata {
    public dateFormat: string = "";
}

export default class DayJsDateWorker extends HiveWorkerBase implements IDateWorker {
    private metadata!: DayJsDateWorkerMetadata;

    constructor() {
        super();
    }

    public async init(config: HiveWorker): Promise<void> {
        await AwaitHelper.execute(super.init(config));
        this.metadata = this.checkObjectStructure<DayJsDateWorkerMetadata>(DayJsDateWorkerMetadata, config.metadata);
    }

    public convertDateBetweenTimezones = (date: Date, toTimezone: string, fromTimezone?: string): string => {
        dayjs.extend(utc);
        dayjs.extend(tz);

        try {
            let fromDate: dayjs.Dayjs;

            if (!fromTimezone || fromTimezone === "") {
                fromDate = dayjs(date);
            } else {
                fromDate = dayjs(date).tz(fromTimezone);
            }

            const toDate: dayjs.Dayjs = fromDate.clone().tz(toTimezone);

            return toDate.format(this.metadata.dateFormat);
        } catch {
            throw new Error("Could not convert timezones.  Check to make sure timezones are IANA-specific");
        }
    };

    public getFormattedDateString = (date: Date, format?: string): string => {
        if (!format) {
            format = this.metadata.dateFormat;
        }

        return dayjs(date).format(format);
    };
}
