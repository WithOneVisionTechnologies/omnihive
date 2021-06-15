CREATE TABLE "oh_srv_config_base" (
	"config_id"	INTEGER NOT NULL,
	"config_name"	TEXT NOT NULL UNIQUE,
	PRIMARY KEY("config_id" AUTOINCREMENT)
)

CREATE TABLE "oh_srv_config_environment" (
	"config_id"	INTEGER NOT NULL,
	"environment_key"	TEXT NOT NULL,
	"environment_value"	TEXT NOT NULL,
	"environment_datatype"	TEXT NOT NULL,
	PRIMARY KEY("config_id","environment_key"),
	FOREIGN KEY("config_id") REFERENCES "oh_srv_config_base"("config_id")
)

CREATE TABLE "oh_srv_config_workers" (
	"config_id"	INTEGER NOT NULL,
	"worker_name"	TEXT NOT NULL,
	"worker_type"	TEXT NOT NULL,
	"worker_package"	TEXT,
	"worker_version"	TEXT NOT NULL,
	"worker_import_path"	TEXT NOT NULL,
	"worker_is_default"	TEXT NOT NULL,
	"worker_is_enabled"	TEXT NOT NULL,
	"worker_metadata"	TEXT,
	PRIMARY KEY("config_id","worker_name"),
	FOREIGN KEY("config_id") REFERENCES "oh_srv_config_base"("config_id")
)
