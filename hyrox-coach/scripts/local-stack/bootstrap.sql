-- Docker-free local Supabase bootstrap.
-- Recreates the parts of the supabase/postgres image that this app depends on:
-- API roles (anon / authenticated / service_role / authenticator), the auth
-- schema owner used by Supabase Auth, the extensions schema, Supabase's default
-- privileges, and the PostgREST schema-reload event trigger.
-- Idempotent: safe to run on every start.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator with login password 'postgres' noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin with login password 'postgres' createrole noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    create role supabase_admin with login password 'postgres' superuser createdb createrole replication bypassrls;
  end if;
end
$$;

grant anon, authenticated, service_role to authenticator;
alter role authenticator set statement_timeout = '8s';
alter role anon set statement_timeout = '3s';
alter role authenticated set statement_timeout = '8s';

create schema if not exists auth authorization supabase_auth_admin;
grant usage on schema auth to anon, authenticated, service_role, postgres;
alter role supabase_auth_admin set search_path = auth;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

alter database postgres set search_path = "$user", public, extensions;

-- Hosted Supabase reloads the PostgREST schema cache automatically after DDL.
create or replace function extensions.pgrst_ddl_watch() returns event_trigger
language plpgsql as $$
begin
  notify pgrst, 'reload schema';
end;
$$;

do $$
begin
  if not exists (select 1 from pg_event_trigger where evtname = 'pgrst_ddl_watch') then
    create event trigger pgrst_ddl_watch on ddl_command_end
      execute procedure extensions.pgrst_ddl_watch();
  end if;
end
$$;
