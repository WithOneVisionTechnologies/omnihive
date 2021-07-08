import { AwaitHelper } from "@withonevision/omnihive-core/helpers/AwaitHelper";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";
import { IDateWorker } from "@withonevision/omnihive-core/interfaces/IDateWorker";
import { HiveWorkerBase } from "@withonevision/omnihive-core/models/HiveWorkerBase";
import dayjs from "dayjs";
import tz from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

export class DayJsDateWorkerMetadata {
    public dateFormat: string = "";
}

export default class DayJsDateWorker extends HiveWorkerBase implements IDateWorker {
    private typedMetadata!: DayJsDateWorkerMetadata;

    constructor() {
        super();
    }

    public async init(name: string, metadata?: any): Promise<void> {
        await AwaitHelper.execute(super.init(name, metadata));
        this.typedMetadata = this.checkObjectStructure<DayJsDateWorkerMetadata>(DayJsDateWorkerMetadata, metadata);
    }

    public convertDateBetweenTimezones = (date: Date, toTimezone: string, fromTimezone?: string): string => {
        dayjs.extend(utc);
        dayjs.extend(tz);

        try {
            let fromDate: dayjs.Dayjs;

            if (IsHelper.isNullOrUndefined(fromTimezone) || IsHelper.isEmptyStringOrWhitespace(fromTimezone)) {
                fromDate = dayjs(date);
            } else {
                fromDate = dayjs(date).tz(fromTimezone);
            }

            const toDate: dayjs.Dayjs = fromDate.clone().tz(toTimezone);

            return toDate.format(this.typedMetadata.dateFormat);
        } catch {
            throw new Error("Could not convert timezones.  Check to make sure timezones are IANA-specific");
        }
    };

    public getFormattedDateString = (date: Date, format?: string): string => {
        if (IsHelper.isNullOrUndefined(format)) {
            format = this.typedMetadata.dateFormat;
        }

        return dayjs(date).format(format);
    };
}
