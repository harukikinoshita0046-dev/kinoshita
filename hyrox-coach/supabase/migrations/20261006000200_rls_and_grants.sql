-- =============================================================================
-- Row Level Security and privileges
--
--   * anon gets nothing: every table requires a signed-in user.
--   * authenticated users can only see and change their own rows
--     ((select auth.uid()) is evaluated once per statement).
--   * The external AI coach never talks to PostgREST directly. Its requests go
--     through the Next.js /api/coach/* routes, which verify a hashed bearer
--     token and scope every query to the token owner (service role, server-side
--     only).
-- =============================================================================

-- Supabase grants everything in public to anon/authenticated by default;
-- start from zero and grant explicitly.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated, public;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- -----------------------------------------------------------------------------
-- Owner-only tables: full CRUD on own rows.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'workout_plans',
    'workout_plan_exercises',
    'workout_sessions',
    'workout_sets',
    'running_sessions',
    'hyrox_results',
    'hyrox_splits',
    'body_metrics',
    'health_metrics',
    'readiness_checkins',
    'coach_insights',
    'user_exercise_settings'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',
      t || '_delete_own', t);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- profiles (primary key is the user id)
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
grant select, insert, update on public.profiles to authenticated;
create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- -----------------------------------------------------------------------------
-- exercise_master: built-ins are read-only, custom exercises belong to owner.
-- -----------------------------------------------------------------------------
alter table public.exercise_master enable row level security;
grant select, insert, update, delete on public.exercise_master to authenticated;
create policy exercise_master_select on public.exercise_master
  for select to authenticated using (owner_id is null or owner_id = (select auth.uid()));
create policy exercise_master_insert_own on public.exercise_master
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy exercise_master_update_own on public.exercise_master
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy exercise_master_delete_own on public.exercise_master
  for delete to authenticated using (owner_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- coach_api_tokens: users manage their own tokens but can never read hashes
-- back and can only rename/revoke after creation.
-- -----------------------------------------------------------------------------
alter table public.coach_api_tokens enable row level security;
grant select (id, user_id, name, token_prefix, scopes, last_used_at, expires_at, revoked_at, created_at)
  on public.coach_api_tokens to authenticated;
grant insert (user_id, name, token_hash, token_prefix, scopes, expires_at) on public.coach_api_tokens to authenticated;
grant update (name, revoked_at) on public.coach_api_tokens to authenticated;
grant delete on public.coach_api_tokens to authenticated;
create policy coach_api_tokens_select_own on public.coach_api_tokens
  for select to authenticated using ((select auth.uid()) = user_id);
create policy coach_api_tokens_insert_own on public.coach_api_tokens
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy coach_api_tokens_update_own on public.coach_api_tokens
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy coach_api_tokens_delete_own on public.coach_api_tokens
  for delete to authenticated using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- api_request_logs: written by the server only, readable by the owner.
-- -----------------------------------------------------------------------------
alter table public.api_request_logs enable row level security;
grant select on public.api_request_logs to authenticated;
create policy api_request_logs_select_own on public.api_request_logs
  for select to authenticated using ((select auth.uid()) = user_id);
