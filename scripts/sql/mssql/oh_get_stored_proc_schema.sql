ALTER procedure [dbo].[oh_get_stored_proc_schema]
as
select  so.name as [storedProcName]
       ,p.parameter_id as [parameterId]
       ,p.name as [parameterName]
       ,type_name(p.user_type_id) as [parameterTypeDatabase]
       ,case typ.[name]
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
        end as [parameterTypeEntity]
       ,P.max_length as [parameterMaxBytes]
from sys.objects as so
    left join sys.parameters as p
        on so.object_id = p.object_id
    left join sys.types typ
        on p.user_type_id = typ.user_type_id
           and P.system_type_id = typ.user_type_id
where so.object_id in (select object_id from sys.objects where type in ('P', 'FN'))
      and so.type_desc = 'SQL_STORED_PROCEDURE'
	  /* Add custom where clause here */
order by so.name
         ,p.parameter_id