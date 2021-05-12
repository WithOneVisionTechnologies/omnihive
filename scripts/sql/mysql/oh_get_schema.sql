DELIMITER $$
CREATE PROCEDURE "oh_get_schema"()
begin

select 
    tab.table_name as TableName,
    col.column_name as ColumnNameDatabase,
    col.data_type as ColumnTypeDatabase,
	case col.data_type
		when 'int' then 'number'
		when 'decimal' then 'number'
		when 'varbinary' then 'string'
		when 'text' then 'string'
		when 'smallint' then 'number'
		when 'varchar' then 'string'
		when 'binary' then 'string'
		when 'datetime' then 'Date'
		when 'numeric' then 'number'
		when 'tinyint' then 'number'
		when 'nchar' then 'string'
		when 'float' then 'number'
		when 'date' then 'Date'
		when 'bigint' then 'number'
		when 'nvarchar' then 'string'
		when 'bool' then 'boolean'
        when 'boolean' then 'boolean'
		when 'longtext' then 'string'
		else null
	end as ColumnTypeEntity,
	case
		when col.is_nullable = 'YES' then true
        else false
	end as ColumnIsNullable,
	case
		when col.extra like '%auto_increment%' then true
		else false
	end as ColumnIsIdentity,
    case
		when col.column_key = 'PRI' then true
        else false
	end as ColumnIsPrimaryKey,
    case
		when fkeys.table_name is not null then true
        else false
	end as ColumnIsForeignKey,
    fkeys.referenced_table_name as ColumnForeignKeyTableName,
    fkeys.referenced_column_name as ColumnForeignKeyColumnName
from information_schema.tables as tab
    inner join information_schema.columns as col
        on col.table_schema = tab.table_schema
        and col.table_name = tab.table_name
	left join (
		select
			table_name,
			column_name,
			constraint_name, 
			referenced_table_name,
			referenced_column_name
		from information_schema.key_column_usage
        where constraint_schema = database()
        and constraint_name != 'PRIMARY'
        and referenced_table_name is not null
        and referenced_column_name is not null
    ) fkeys
		on tab.table_name = fkeys.table_name
        and col.column_name = fkeys.column_name
where tab.table_type = 'BASE TABLE'
    and tab.table_schema not in ('information_schema','mysql',
        'performance_schema','sys')
    and tab.table_schema = database() 
	/* add custom where clause here */
order by tab.table_name,
    col.ordinal_position;

end$$
DELIMITER ;
