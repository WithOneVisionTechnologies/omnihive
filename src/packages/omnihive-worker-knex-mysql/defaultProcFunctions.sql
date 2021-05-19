select r.routine_schema as procfunc_schema,
	'storedProcedure' as procfunc_type,
	r.specific_name as procfunc_name,
	p.ordinal_position as parameter_order,
	p.parameter_name as parameter_name,
	p.data_type as parameter_type_database,
	case
		p.data_type
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
		else null
	end as parameter_type_entity
from information_schema.routines r
	left join information_schema.parameters p on p.specific_schema = r.routine_schema
	and p.specific_name = r.specific_name
	and p.parameter_mode in ('IN', 'INOUT')
where r.routine_schema not in (
		'sys',
		'information_schema',
		'mysql',
		'performance_schema'
	)
	and r.routine_schema = database()
order by r.routine_schema,
	r.specific_name,
	p.ordinal_position;