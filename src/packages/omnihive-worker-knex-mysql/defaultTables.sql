select tab.TABLE_SCHEMA as schema_name,
	tab.table_name as table_name,
	col.column_name as column_name_database,
	col.data_type as column_type_database,
	case
		col.data_type
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
	end as column_type_entity,
	if(col.is_nullable = 'YES', true, false) as column_is_nullable,
	if(col.extra like '%auto_increment%', true, false) as column_is_identity,
	if(col.column_key = 'PRI', true, false) as column_is_primary_key,
	if(fkeys.table_name is not null, true, false) as column_is_foreign_key,
	fkeys.referenced_table_name as column_foreign_key_table_name,
	fkeys.referenced_column_name as column_foreign_key_column_name,
	col.ordinal_position as column_position
from information_schema.tables as tab
	inner join information_schema.columns as col on col.table_schema = tab.table_schema
	and col.table_name = tab.table_name
	left join (
		select table_name,
			column_name,
			constraint_name,
			referenced_table_name,
			referenced_column_name
		from information_schema.key_column_usage
		where constraint_schema = database()
			and constraint_name != 'PRIMARY'
			and referenced_table_name is not null
			and referenced_column_name is not null
	) fkeys on tab.table_name = fkeys.table_name
	and col.column_name = fkeys.column_name
where tab.table_type = 'BASE TABLE'
	and tab.table_schema not in (
		'information_schema',
		'mysql',
		'performance_schema',
		'sys'
	)
	and tab.table_schema = database()
order by tab.table_name,
	col.ordinal_position;