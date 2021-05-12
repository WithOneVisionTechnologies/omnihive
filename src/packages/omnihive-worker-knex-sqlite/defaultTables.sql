select m.name as table_name,
	p.name as column_name_database,
	p.type as column_type_database,
	case
		p.type
		when 'INTEGER' then 'number'
		when 'REAL' then 'number'
		when 'TEXT' then 'string'
		when 'BLOB' then 'string'
		else null
	end as column_type_entity,
	p.cid + 1 as column_position,
	p.[notnull] as column_is_nullable,
	case
		(
			select count(*)
			from sqlite_master
			where tbl_name = m.name
				and p.pk = 1
				and sql like "%AUTOINCREMENT%"
		)
		when 0 then false
		else true
	end as column_is_identity,
	p.pk as column_is_primary_key,
	case
		when fk.id is not null then true
		else false
	end as column_is_foreign_key,
	fk.[table] as column_foreign_key_table_name,
	fk.[to] as column_foreign_key_column_name
from sqlite_master m
	left outer join pragma_table_info(m.name) p on m.name <> p.name
	left outer join pragma_foreign_key_list(m.name) fk on m.name <> fk.[table]
	and p.name = fk.[from]
where m.type = 'table'
	and m.name != 'sqlite_sequence'
order by m.name,
	p.cid;