CREATE TABLE IF NOT EXISTS public.oh_srv_config_base
(
    config_id integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
    config_name character varying(100) COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT pk_oh_srv_config_base PRIMARY KEY (config_id),
    CONSTRAINT uq_oh_srv_config_base UNIQUE (config_name)
)

TABLESPACE pg_default;

ALTER TABLE public.oh_srv_config_base
    OWNER to postgres;

CREATE TABLE IF NOT EXISTS public.oh_srv_config_environment
(
    config_id integer NOT NULL,
    environment_key character varying(100) COLLATE pg_catalog."default" NOT NULL,
    environment_value character varying(1000) COLLATE pg_catalog."default" NOT NULL,
    environment_datatype character varying(100) COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT pk_oh_srv_config_environment PRIMARY KEY (config_id, environment_key),
    CONSTRAINT oh_srv_config_environment_config_id FOREIGN KEY (config_id)
        REFERENCES public.oh_srv_config_base (config_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)

TABLESPACE pg_default;

ALTER TABLE public.oh_srv_config_environment
    OWNER to postgres;

CREATE TABLE IF NOT EXISTS public.oh_srv_config_workers
(
    config_id integer NOT NULL,
    worker_name character varying(100) COLLATE pg_catalog."default" NOT NULL,
    worker_type character varying(100) COLLATE pg_catalog."default" NOT NULL,
    worker_package character varying(1000) COLLATE pg_catalog."default",
    worker_version character varying(100) COLLATE pg_catalog."default" NOT NULL,
    worker_import_path character varying(1000) COLLATE pg_catalog."default" NOT NULL,
    worker_is_default boolean NOT NULL,
    worker_is_enabled boolean NOT NULL,
    worker_metadata json,
    CONSTRAINT pk_oh_srv_config_workers PRIMARY KEY (config_id, worker_name),
    CONSTRAINT oh_srv_config_workers FOREIGN KEY (config_id)
        REFERENCES public.oh_srv_config_base (config_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE NO ACTION
)

TABLESPACE pg_default;

ALTER TABLE public.oh_srv_config_workers
    OWNER to postgres;