export class TableSchema {
    public schemaName: string = "";
    public tableName: string = "";
    public tableNameCamelCase: string = "";
    public tableNamePascalCase: string = "";
    public columnNameDatabase: string = "";
    public columnNameEntity: string = "";
    public columnTypeDatabase: string = "";
    public columnTypeEntity: string = "";
    public columnPosition: number = 0;
    public columnIsNullable: boolean = true;
    public columnIsIdentity: boolean = false;
    public columnIsPrimaryKey: boolean = false;
    public columnIsForeignKey: boolean = false;
    public columnForeignKeyTableName: string = "";
    public columnForeignKeyTableNameCamelCase: string = "";
    public columnForeignKeyTableNamePascalCase: string = "";
    public columnForeignKeyColumnName: string = "";
}
