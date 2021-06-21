import { DataSourceType } from "../enums/DataSourceType";

export class CreateInstanceModel {
    public configFilePath: string = "";
    public dataSourceType: DataSourceType = DataSourceType.JSON;
}
