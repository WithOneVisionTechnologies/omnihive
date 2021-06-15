CREATE TABLE `oh_srv_config_base` (
  `config_id` int NOT NULL AUTO_INCREMENT,
  `config_name` varchar(100) NOT NULL,
  PRIMARY KEY (`config_id`,`config_name`),
  UNIQUE KEY `config_name_UNIQUE` (`config_name`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `oh_srv_config_environment` (
  `config_id` int NOT NULL,
  `environment_key` varchar(100) NOT NULL,
  `environment_value` varchar(1000) NOT NULL,
  `environment_datatype` varchar(45) DEFAULT NULL,
  PRIMARY KEY (`config_id`,`environment_key`),
  CONSTRAINT `oh_environment_config` FOREIGN KEY (`config_id`) REFERENCES `oh_srv_config_base` (`config_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `oh_srv_config_workers` (
  `config_id` int NOT NULL,
  `worker_name` varchar(100) NOT NULL,
  `worker_type` varchar(100) NOT NULL,
  `worker_package` varchar(1000) DEFAULT NULL,
  `worker_version` varchar(50) NOT NULL,
  `worker_import_path` varchar(1000) NOT NULL,
  `worker_is_default` tinyint NOT NULL,
  `worker_is_enabled` tinyint NOT NULL,
  `worker_metadata` json DEFAULT NULL,
  PRIMARY KEY (`config_id`,`worker_name`),
  CONSTRAINT `oh_worker_config_id` FOREIGN KEY (`config_id`) REFERENCES `oh_srv_config_base` (`config_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;