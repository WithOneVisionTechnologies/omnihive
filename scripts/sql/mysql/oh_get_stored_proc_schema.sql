DELIMETER $$
create procedure oh_get_stored_proc_schema()
begin

select 
	r.specific_name as StoredProcName,
    p.ordinal_position as ParameterId,
    p.parameter_name as ParameterName,
    p.data_type as ParameterTypeDatabase,
    case p.data_type
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
	end as ParameterTypeEntity,
	p.character_maximum_length as ParameterMaxLength
from information_schema.routines r
	left join information_schema.parameters p
		on p.specific_schema = r.routine_schema
		and p.specific_name = r.specific_name
where 
	r.routine_schema not in ('sys', 'information_schema', 'mysql', 'performance_schema')
	and r.routine_schema = database()
	/* Add custom where clause here */
order by 
	r.routine_schema,
    r.specific_name,
    p.ordinal_position;
    
end $$

DELIMETER ;