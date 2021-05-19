drop table if exists oh_schema;

create temporary table oh_schema (
	schema_name varchar(1000),
	table_name varchar(1000),
	column_name_database varchar(1000),
	column_type_database varchar(1000),
	column_type_entity varchar(1000),
	column_position smallint,
	column_is_nullable boolean default FALSE,
	column_is_identity boolean default FALSE,
	column_is_primary_key boolean default FALSE,
	column_is_foreign_key boolean default FALSE,
	column_foreign_key_table_name varchar(1000) null,
	column_foreign_key_column_name varchar(1000) null
);

insert into oh_schema (
		schema_name,
		table_name,
		column_name_database,
		column_type_database,
		column_type_entity,
		column_position,
		column_is_nullable,
		column_is_identity
	)
select table_schema,
	table_name,
	column_name,
	data_type,
	case
		data_type
		when 'boolean' then 'boolean'
		when 'character varying' then 'string'
		when 'character' then 'string'
		when 'varchar' then 'string'
		when 'char' then 'string'
		when 'text' then 'string'
		when 'uuid' then 'string'
		when 'json' then 'string'
		when 'smallint' then 'number'
		when 'integer' then 'number'
		when 'bigint' then 'number'
		when 'decimal' then 'number'
		when 'numeric' then 'number'
		when 'real' then 'number'
		when 'double precision' then 'number'
		when 'smallserial' then 'number'
		when 'serial' then 'number'
		when 'bigserial' then 'number'
		when 'money' then 'number'
		when 'date' then 'Date'
		else 'unknown'
	end,
	ordinal_position,
	case
		is_nullable
		when 'NO' then false
		when 'YES' then true
		else false
	end,
	case
		is_identity
		when 'NO' then false
		when 'YES' then true
		else false
	end
from information_schema.columns
where table_schema not in ('pg_catalog', 'information_schema')
	and table_schema not like 'pg_temp%';

update oh_schema as s
set column_is_primary_key = 'True'
from (
		select kcu.table_name,
			kcu.column_name as key_column
		from information_schema.table_constraints tco
			join information_schema.key_column_usage kcu on kcu.constraint_name = tco.constraint_name
			and kcu.constraint_schema = tco.constraint_schema
			and kcu.constraint_name = tco.constraint_name
		where tco.constraint_type = 'PRIMARY KEY'
			and kcu.table_schema not in ('pg_catalog', 'information_schema')
			and kcu.table_schema not like 'pg_temp%'
	) as pks
where s.table_name = pks.table_name
	and s.column_name_database = pks.key_column;

update oh_schema as s
set column_is_foreign_key = true,
	column_foreign_key_table_name = pks.foreign_table_name,
	column_foreign_key_column_name = pks.foreign_column_name
from (
		select tc.table_name,
			kcu.column_name,
			ccu.table_name as foreign_table_name,
			ccu.column_name as foreign_column_name
		from information_schema.table_constraints as tc
			join information_schema.key_column_usage as kcu on tc.constraint_name = kcu.constraint_name
			and tc.table_schema = kcu.table_schema
			join information_schema.constraint_column_usage as ccu on ccu.constraint_name = tc.constraint_name
			and ccu.table_schema = tc.table_schema
		where tc.constraint_type = 'FOREIGN KEY'
			and tc.table_schema not in ('pg_catalog', 'information_schema')
			and tc.table_schema not like 'pg_temp%'
			and ccu.table_schema not in ('pg_catalog', 'information_schema')
			and ccu.table_schema not like 'pg_temp%'
	) as pks
where s.table_name = pks.table_name
	and s.column_name_database = pks.column_name;

select schema_name,
	table_name,
	column_name_database,
	column_type_database,
	column_type_entity,
	column_position,
	column_is_nullable,
	column_is_identity,
	column_is_primary_key,
	column_is_foreign_key,
	column_foreign_key_table_name,
	column_foreign_key_column_name
from oh_schema
order by table_name,
	column_name_database;