import { DataSourceType } from "../enums/DataSourceType";
import generator from "generate-password";
import { v4 as uuidv4 } from "uuid";

export class CreateInstanceModel {
    public adminPassword: string = generator.generate({
        length: 32,
        numbers: true,
        symbols: false,
        lowercase: true,
        uppercase: true,
        excludeSimilarCharacters: true,
        strict: true,
    });

    public adminServerGroupId: string = uuidv4();
    public adminSocketPort: number = 7205;
    public adminWebPort: number = 7206;
    public configFilePath: string = "";
    public dataSourceType: DataSourceType = DataSourceType.JSON;
}
