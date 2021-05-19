export class HiveWorkerMetadataDatabase {
    public connectionPoolLimit: number = 25;
    public databaseName: string = "";
    public getProcFunctionSqlFile: string = "";
    public getSchemaSqlFile: string = "";
    public ignoreSchema: boolean = true;
    public password: string = "";
    public procFunctionGraphSchemaName: string = "";
    public requireSsl: boolean = false;
    public rowLimit: number = 0;
    public schemas: string[] = [];
    public serverAddress: string = "";
    public serverPort: number = 0;
    public sslCertPath: string = "";
    public urlRoute: string = "";
    public userName: string = "";
}
