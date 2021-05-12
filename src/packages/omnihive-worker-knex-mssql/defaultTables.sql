declare @oh_schema table (
		table_id int,
		schema_name nvarchar(1000),
		table_name nvarchar(1000),
		column_id int,
		column_name_database nvarchar(1000),
		column_type_database nvarchar(1000),
		column_type_entity nvarchar(1000),
		column_position smallint,
		column_is_nullable bit default 'False',
		column_is_identity bit default 'False',
		column_is_primary_key bit default 'False',
		column_is_foreign_key bit default 'False',
		column_foreign_key_table_id int null,
		column_foreign_key_table_name nvarchar(1000) null,
		column_foreign_key_column_id int null,
		column_foreign_key_column_name nvarchar(1000) null
	);

insert @oh_schema (
		table_id,
		schema_name,
		table_name,
		column_id,
		column_name_database,
		column_type_database,
		column_type_entity,
		column_position,
		column_is_nullable,
		column_is_identity
	)
select tbl.[object_id],
	schema_name(tbl.schema_id),
	tbl.[name],
	col.column_id,
	col.[name],
	typ.[name],
	case
		typ.[name]
		when 'money' then 'number'
		when 'int' then 'number'
		when 'decimal' then 'number'
		when 'varbinary' then 'string'
		when 'text' then 'string'
		when 'smallint' then 'number'
		when 'varchar' then 'string'
		when 'binary' then 'string'
		when 'datetime' then 'Date'
		when 'time' then 'string'
		when 'numeric' then 'number'
		when 'uniqueidentifier' then 'string'
		when 'tinyint' then 'number'
		when 'nchar' then 'string'
		when 'float' then 'number'
		when 'date' then 'Date'
		when 'bigint' then 'number'
		when 'nvarchar' then 'string'
		when 'bit' then 'boolean'
		else 'unknown'
	end,
	col.column_id,
	col.is_nullable,
	col.is_identity
from sys.tables tbl
	inner join sys.columns col on tbl.[object_id] = col.[object_id]
	inner join sys.types typ on col.user_type_id = typ.user_type_id
	and col.system_type_id = typ.system_type_id
where tbl.[type] = 'U'
	and tbl.[name] not in ('sysdiagrams');

update s
set s.column_is_primary_key = 'True'
from @oh_schema s
	inner join (
		select ta.[object_id] as tableObjectId,
			ta.[name] as tableName,
			col.column_id as columnId,
			col.[name] as ColumnName
		from sys.tables ta
			inner join sys.indexes ind on ind.[object_id] = ta.[object_id]
			inner join sys.index_columns indcol on indcol.[object_id] = ta.[object_id]
			and indcol.index_id = ind.index_id
			inner join sys.columns col on col.[object_id] = ta.[object_id]
			and col.column_id = indcol.column_id
		where ind.is_primary_key = 1
	) pks on s.table_id = pks.tableObjectId
	and s.column_id = pks.columnId;

update s
set s.column_foreign_key_table_id = sparent.table_id,
	s.column_foreign_key_table_name = sparent.table_name,
	s.column_foreign_key_column_id = sparent.column_id,
	s.column_foreign_key_column_name = sparent.column_name_database,
	s.column_is_foreign_key = 1
from @oh_schema s
	inner join sys.foreign_key_columns fkc on s.table_id = fkc.parent_object_id
	and s.column_id = fkc.parent_column_id
	inner join @oh_schema sparent on fkc.referenced_object_id = sparent.table_id
	and fkc.referenced_column_id = sparent.column_id;

select s.schema_name,
	s.table_name,
	s.column_name_database,
	s.column_type_database,
	s.column_type_entity,
	s.column_position,
	s.column_is_nullable,
	s.column_is_identity,
	s.column_is_primary_key,
	s.column_is_foreign_key,
	s.column_foreign_key_table_name,
	s.column_foreign_key_column_name
from @oh_schema s
order by s.table_name,
	s.column_name_database;