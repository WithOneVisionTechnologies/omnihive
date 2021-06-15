SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[oh_srv_config_base](
	[config_id] [int] IDENTITY(1,1) NOT NULL,
	[config_name] [nvarchar](100) NOT NULL
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[oh_srv_config_base] ADD  CONSTRAINT [PK_oh_srv_config_base] PRIMARY KEY CLUSTERED 
(
	[config_id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, IGNORE_DUP_KEY = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
GO
SET ANSI_PADDING ON
GO
ALTER TABLE [dbo].[oh_srv_config_base] ADD  CONSTRAINT [UQ_oh_srv_config_base_config_name] UNIQUE NONCLUSTERED 
(
	[config_name] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, IGNORE_DUP_KEY = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[oh_srv_config_environment](
	[config_id] [int] NOT NULL,
	[environment_key] [nvarchar](100) NOT NULL,
	[environment_value] [nvarchar](1000) NOT NULL,
	[environment_datatype] [nvarchar](100) NOT NULL
) ON [PRIMARY]
GO
SET ANSI_PADDING ON
GO
ALTER TABLE [dbo].[oh_srv_config_environment] ADD  CONSTRAINT [PK_oh_srv_config_environment] PRIMARY KEY CLUSTERED 
(
	[config_id] ASC,
	[environment_key] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, IGNORE_DUP_KEY = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
GO
ALTER TABLE [dbo].[oh_srv_config_environment]  WITH CHECK ADD  CONSTRAINT [FK_oh_srv_config_environment_oh_srv_config_base] FOREIGN KEY([config_id])
REFERENCES [dbo].[oh_srv_config_base] ([config_id])
GO
ALTER TABLE [dbo].[oh_srv_config_environment] CHECK CONSTRAINT [FK_oh_srv_config_environment_oh_srv_config_base]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[oh_srv_config_workers](
	[config_id] [int] NOT NULL,
	[worker_name] [nvarchar](100) NOT NULL,
	[worker_type] [nvarchar](100) NOT NULL,
	[worker_package] [nvarchar](1000) NULL,
	[worker_version] [nvarchar](100) NOT NULL,
	[worker_import_path] [nvarchar](1000) NOT NULL,
	[worker_is_default] [bit] NOT NULL,
	[worker_is_enabled] [bit] NOT NULL,
	[worker_metadata] [nvarchar](max) NULL
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
SET ANSI_PADDING ON
GO
ALTER TABLE [dbo].[oh_srv_config_workers] ADD  CONSTRAINT [PK_oh_srv_config_workers] PRIMARY KEY CLUSTERED 
(
	[config_id] ASC,
	[worker_name] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, IGNORE_DUP_KEY = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
GO
ALTER TABLE [dbo].[oh_srv_config_workers]  WITH CHECK ADD  CONSTRAINT [FK_oh_srv_config_workers_oh_srv_config_base] FOREIGN KEY([config_id])
REFERENCES [dbo].[oh_srv_config_base] ([config_id])
GO
ALTER TABLE [dbo].[oh_srv_config_workers] CHECK CONSTRAINT [FK_oh_srv_config_workers_oh_srv_config_base]
GO
