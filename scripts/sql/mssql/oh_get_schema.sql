alter	procedure [dbo].[oh_get_schema]
as
	begin

		declare @schema table (
			tableId						int
			,tableName					nvarchar(1000)
			,columnId					int
			,columnNameDatabase			nvarchar(1000)
			,columnTypeDatabase			nvarchar(1000)
			,columnTypeEntity			nvarchar(1000)
			,columnIsNullable			bit
			,columnIsIdentity			bit
			,columnIsPrimaryKey			bit
				default 'False'
			,columnIsForeignKey			bit
				default 'False'
			,columnForeignKeyTableId	int				null
			,columnForeignKeyTableName	nvarchar(1000)	null
			,columnForeignKeyColumnId	int				null
			,columnForeignKeyColumnName nvarchar(1000) null
		);

		insert	@schema (tableId
						,tableName
						,columnId
						,columnNameDatabase
						,columnTypeDatabase
						,columnTypeEntity
						,columnIsNullable
						,columnIsIdentity)
		select	tbl.[object_id]
				,tbl.[name]
				,col.column_id
				,col.[name]
				,typ.[name]
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
					else 'unknown'
				end
				,	col.is_nullable
				,col.is_identity
		from	sys.tables tbl
			inner join sys.columns col
				on tbl.[object_id] = col.[object_id]
			inner join sys.types typ
				on col.user_type_id = typ.user_type_id
				and col.system_type_id = typ.system_type_id
		where tbl.[type] = 'U'
			and tbl.[name] not in ('sysdiagrams');

		update	s
		set s.columnIsPrimaryKey = 'True'
		from	@schema s
			inner join (select		ta.[object_id] as tableObjectId
									,ta.[name] as tableName
									,col.column_id as columnId
									,col.[name] as ColumnName
						from	sys.tables ta
							inner join sys.indexes ind
								on ind.[object_id] = ta.[object_id]
							inner join sys.index_columns indcol
								on indcol.[object_id] = ta.[object_id]
								and indcol.index_id = ind.index_id
							inner join sys.columns col
								on col.[object_id] = ta.[object_id]
								and col.column_id = indcol.column_id
						where ind.is_primary_key = 1) pks
				on s.tableId = pks.tableObjectId
				and s.columnId = pks.columnId;

		update	s
		set s.columnForeignKeyTableId = sparent.tableId
			,s.columnForeignKeyTableName = sparent.tableName
			,s.columnForeignKeyColumnId = sparent.columnId
			,s.columnForeignKeyColumnName = sparent.columnNameDatabase
			,s.columnIsForeignKey = 1
		from	@schema s
			inner join sys.foreign_key_columns fkc
				on s.tableId = fkc.parent_object_id
				and s.columnId = fkc.parent_column_id
			inner join @schema sparent
				on fkc.referenced_object_id = sparent.tableId
				and fkc.referenced_column_id = sparent.columnId;

		select	s.tableName
				,s.columnId
				,s.columnNameDatabase
				,s.columnTypeDatabase
				,s.columnTypeEntity
				,s.columnIsNullable
				,s.columnIsIdentity
				,s.columnIsPrimaryKey
				,s.columnIsForeignKey
				,s.columnForeignKeyTableName
				,s.columnForeignKeyColumnName
		from	@schema s
		order by s.tableName
				,s.columnNameDatabase;

	end;