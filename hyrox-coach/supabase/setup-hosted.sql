-- HYROX AI Coach: hosted Supabase setup (generated from supabase/migrations — do not edit).
-- Paste the whole file into Supabase Dashboard -> SQL Editor -> Run, once, on an empty project.
-- It also records the migrations so a later `supabase db push` skips them.
-- Regenerate with: npm run db:bundle

-- ===== 20261006000100_core_schema.sql =====
-- =============================================================================
-- HYROX AI Coach — core schema
--
-- Conventions
--   * Every user-owned row carries user_id (references auth.users) so RLS is a
--     direct column check, without joins.
--   * Child rows reference their parent with a composite (parent_id, user_id)
--     foreign key, so a child can never be attached to another user's parent.
--   * Units live in column names or comments, never in values:
--     weight = kg, distance = m (distance_km for runs), *_seconds = s,
--     pace = seconds per km, hrv = ms, sleep = minutes.
--   * `date` columns are local calendar dates in the athlete's timezone
--     (profiles.timezone); timestamps are timestamptz.
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles: athlete settings and goals (1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  timezone text not null default 'Asia/Tokyo',
  sex text check (sex in ('male', 'female', 'other')),
  birth_year int check (birth_year between 1900 and 2100),
  height_cm numeric(5, 1) check (height_cm between 100 and 250),
  max_hr int check (max_hr between 120 and 230),
  target_weight_kg numeric(5, 2) check (target_weight_kg between 30 and 250),
  target_weight_date date,
  hyrox_division text not null default 'open_men'
    check (hyrox_division in ('open_men', 'open_women', 'pro_men', 'pro_women', 'doubles_men', 'doubles_women', 'doubles_mixed')),
  hyrox_goal_seconds int check (hyrox_goal_seconds between 1800 and 14400),
  next_race_date date,
  next_race_name text check (char_length(next_race_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Athlete profile, goals and preferences. Row id = auth.users.id.';
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- exercise_master: built-in exercises (owner_id null) + user custom exercises
-- -----------------------------------------------------------------------------
create table public.exercise_master (
  id text primary key check (id ~ '^[a-z0-9_]{2,64}$'),
  owner_id uuid references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  category text not null
    check (category in ('push', 'pull', 'legs', 'hinge', 'core', 'carry', 'hyrox_station', 'cardio', 'run', 'other')),
  primary_muscle text,
  secondary_muscles text[] not null default '{}',
  hyrox_relevance smallint not null default 0 check (hyrox_relevance between 0 and 3),
  is_hyrox_station boolean not null default false,
  hyrox_station_order smallint check (hyrox_station_order between 1 and 8),
  unit_type text not null
    check (unit_type in ('weight_reps', 'bodyweight_reps', 'reps', 'distance_time', 'weight_distance', 'time')),
  weight_increment numeric(5, 2) not null default 2.5 check (weight_increment > 0),
  default_rest_seconds int not null default 90 check (default_rest_seconds between 0 and 1800),
  default_distance_m int check (default_distance_m > 0),
  aliases text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique nulls not distinct (owner_id, name)
);
comment on column public.exercise_master.hyrox_relevance is '0 = none, 1 = low, 2 = medium, 3 = high / race station.';
comment on column public.exercise_master.unit_type is
  'Which inputs the logger shows: weight_reps, bodyweight_reps (weight = added load), reps, distance_time, weight_distance, time.';
create unique index exercise_master_station_order_key on public.exercise_master (hyrox_station_order)
  where owner_id is null and hyrox_station_order is not null;

-- Per-user overrides for built-in exercises (weight step, rest, hide).
create table public.user_exercise_settings (
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id text not null references public.exercise_master (id) on delete cascade,
  weight_increment numeric(5, 2) check (weight_increment > 0),
  default_rest_seconds int check (default_rest_seconds between 0 and 1800),
  hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);
create trigger user_exercise_settings_set_updated_at before update on public.user_exercise_settings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- workout_plans / workout_plan_exercises: the prescription (AI or user)
-- -----------------------------------------------------------------------------
create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  title text not null check (char_length(title) between 1 and 120),
  workout_type text not null
    check (workout_type in ('upper', 'lower', 'full_body', 'hyrox', 'run', 'simulation', 'conditioning', 'recovery', 'other')),
  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'completed', 'skipped', 'cancelled')),
  created_by text not null default 'USER' check (created_by in ('AI', 'USER')),
  coach_reason text check (char_length(coach_reason) <= 2000),
  estimated_duration_min int check (estimated_duration_min between 1 and 600),
  source text check (char_length(source) <= 40),
  idempotency_key text check (char_length(idempotency_key) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, idempotency_key)
);
create index workout_plans_user_date_idx on public.workout_plans (user_id, date desc);
create trigger workout_plans_set_updated_at before update on public.workout_plans
  for each row execute function public.set_updated_at();

create table public.workout_plan_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_plan_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  order_index int not null check (order_index >= 0),
  exercise_id text not null references public.exercise_master (id),
  original_exercise_id text references public.exercise_master (id),
  added_in_session boolean not null default false,
  target_sets int check (target_sets between 1 and 50),
  target_reps_min int check (target_reps_min between 0 and 1000),
  target_reps_max int check (target_reps_max between 0 and 1000),
  target_weight numeric(6, 2) check (target_weight >= 0),
  target_distance numeric(8, 1) check (target_distance >= 0),
  target_time int check (target_time >= 0),
  target_rpe numeric(3, 1) check (target_rpe between 1 and 10),
  target_pace_min int check (target_pace_min between 120 and 1200),
  target_pace_max int check (target_pace_max between 120 and 1200),
  target_hr_zone smallint check (target_hr_zone between 1 and 5),
  rest_seconds int check (rest_seconds between 0 and 1800),
  coach_note text check (char_length(coach_note) <= 500),
  created_at timestamptz not null default now(),
  check (target_reps_min is null or target_reps_max is null or target_reps_min <= target_reps_max),
  check (target_pace_min is null or target_pace_max is null or target_pace_min <= target_pace_max),
  unique (id, user_id),
  unique (workout_plan_id, order_index) deferrable initially deferred,
  foreign key (workout_plan_id, user_id) references public.workout_plans (id, user_id) on delete cascade
);
comment on column public.workout_plan_exercises.target_distance is 'meters';
comment on column public.workout_plan_exercises.target_time is 'seconds';
comment on column public.workout_plan_exercises.target_pace_min is 'fastest target pace, seconds per km';
comment on column public.workout_plan_exercises.target_pace_max is 'slowest target pace, seconds per km';
create index workout_plan_exercises_user_idx on public.workout_plan_exercises (user_id);

-- -----------------------------------------------------------------------------
-- workout_sessions / workout_sets: what actually happened
-- -----------------------------------------------------------------------------
create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_plan_id uuid,
  date date not null,
  title text not null check (char_length(title) between 1 and 120),
  workout_type text not null
    check (workout_type in ('upper', 'lower', 'full_body', 'hyrox', 'run', 'simulation', 'conditioning', 'recovery', 'other')),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_seconds int generated always as (
    case when finished_at is null then null
         else greatest(0, extract(epoch from (finished_at - started_at)))::int end
  ) stored,
  session_rpe numeric(3, 1) check (session_rpe between 1 and 10),
  average_hr int check (average_hr between 30 and 250),
  max_hr int check (max_hr between 30 and 250),
  calories int check (calories between 0 and 10000),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (finished_at is null or finished_at >= started_at),
  unique (id, user_id),
  foreign key (workout_plan_id, user_id) references public.workout_plans (id, user_id)
    on delete set null (workout_plan_id)
);
create index workout_sessions_user_started_idx on public.workout_sessions (user_id, started_at desc);
create index workout_sessions_user_date_idx on public.workout_sessions (user_id, date desc);
-- A plan can only be in progress once (protects against double-tapping START).
create unique index workout_sessions_one_active_per_plan on public.workout_sessions (workout_plan_id)
  where status = 'in_progress';
create trigger workout_sessions_set_updated_at before update on public.workout_sessions
  for each row execute function public.set_updated_at();

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null,
  plan_exercise_id uuid,
  exercise_id text not null references public.exercise_master (id),
  set_number int not null check (set_number between 1 and 100),
  weight numeric(6, 2) check (weight >= 0),
  reps int check (reps between 0 and 1000),
  distance numeric(8, 1) check (distance >= 0),
  time_seconds int check (time_seconds >= 0),
  rpe numeric(3, 1) check (rpe between 1 and 10),
  average_hr int check (average_hr between 30 and 250),
  max_hr int check (max_hr between 30 and 250),
  is_warmup boolean not null default false,
  notes text check (char_length(notes) <= 500),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (session_id, user_id) references public.workout_sessions (id, user_id) on delete cascade,
  foreign key (plan_exercise_id, user_id) references public.workout_plan_exercises (id, user_id)
    on delete set null (plan_exercise_id)
);
comment on column public.workout_sets.weight is 'kg (added load for bodyweight exercises)';
comment on column public.workout_sets.distance is 'meters';
create index workout_sets_session_idx on public.workout_sets (session_id);
create index workout_sets_user_exercise_idx on public.workout_sets (user_id, exercise_id, completed_at desc);
create index workout_sets_plan_exercise_idx on public.workout_sets (plan_exercise_id);

-- -----------------------------------------------------------------------------
-- running_sessions
-- -----------------------------------------------------------------------------
create table public.running_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_plan_id uuid,
  date date not null,
  started_at timestamptz,
  run_type text not null
    check (run_type in ('easy', 'zone2', 'tempo', 'threshold', 'intervals', 'hyrox_run', 'long_run', 'recovery')),
  distance_km numeric(6, 2) not null check (distance_km > 0 and distance_km < 500),
  duration_seconds int not null check (duration_seconds > 0 and duration_seconds < 172800),
  average_pace numeric(7, 1) generated always as (round(duration_seconds / distance_km, 1)) stored,
  average_hr int check (average_hr between 30 and 250),
  max_hr int check (max_hr between 30 and 250),
  cadence int check (cadence between 50 and 260),
  calories int check (calories between 0 and 20000),
  elevation_gain_m int check (elevation_gain_m between 0 and 10000),
  rpe numeric(3, 1) check (rpe between 1 and 10),
  zone1_seconds int check (zone1_seconds >= 0),
  zone2_seconds int check (zone2_seconds >= 0),
  zone3_seconds int check (zone3_seconds >= 0),
  zone4_seconds int check (zone4_seconds >= 0),
  zone5_seconds int check (zone5_seconds >= 0),
  splits jsonb check (splits is null or jsonb_typeof(splits) = 'array'),
  notes text check (char_length(notes) <= 2000),
  source text not null default 'manual' check (source in ('manual', 'apple_health', 'import')),
  external_id text check (char_length(external_id) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source, external_id),
  foreign key (workout_plan_id, user_id) references public.workout_plans (id, user_id)
    on delete set null (workout_plan_id)
);
comment on column public.running_sessions.average_pace is 'seconds per km (generated from duration and distance)';
comment on column public.running_sessions.splits is 'array of {distance_m, time_seconds, average_hr?}';
create index running_sessions_user_date_idx on public.running_sessions (user_id, date desc);
create trigger running_sessions_set_updated_at before update on public.running_sessions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- HYROX races and simulations
-- -----------------------------------------------------------------------------
create table public.hyrox_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_plan_id uuid,
  date date not null,
  event_type text not null check (event_type in ('race', 'simulation', 'partial')),
  division text check (division in ('open_men', 'open_women', 'pro_men', 'pro_women', 'doubles_men', 'doubles_women', 'doubles_mixed')),
  name text check (char_length(name) <= 120),
  status text not null default 'completed' check (status in ('in_progress', 'completed', 'abandoned')),
  total_seconds int check (total_seconds > 0),
  run_total_seconds int check (run_total_seconds >= 0),
  station_total_seconds int check (station_total_seconds >= 0),
  roxzone_seconds int check (roxzone_seconds >= 0),
  notes text check (char_length(notes) <= 2000),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (workout_plan_id, user_id) references public.workout_plans (id, user_id)
    on delete set null (workout_plan_id)
);
create index hyrox_results_user_date_idx on public.hyrox_results (user_id, date desc);
create trigger hyrox_results_set_updated_at before update on public.hyrox_results
  for each row execute function public.set_updated_at();

-- 16 segments: odd = Run 1..8, even = Station 1..8 (official order).
create table public.hyrox_splits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  result_id uuid not null,
  segment_index smallint not null check (segment_index between 1 and 16),
  segment_type text not null check (segment_type in ('run', 'station')),
  exercise_id text not null references public.exercise_master (id),
  duration_seconds int not null check (duration_seconds >= 0),
  roxzone_seconds int check (roxzone_seconds >= 0),
  created_at timestamptz not null default now(),
  check ((segment_type = 'run') = (segment_index % 2 = 1)),
  unique (result_id, segment_index),
  foreign key (result_id, user_id) references public.hyrox_results (id, user_id) on delete cascade
);
comment on column public.hyrox_splits.roxzone_seconds is 'transition time spent after this segment (Roxzone)';
create index hyrox_splits_user_exercise_idx on public.hyrox_splits (user_id, exercise_id);

-- -----------------------------------------------------------------------------
-- Body, health and subjective readiness (one row per local date)
-- -----------------------------------------------------------------------------
create table public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  weight numeric(5, 2) check (weight between 20 and 300),
  body_fat_percentage numeric(4, 1) check (body_fat_percentage between 2 and 70),
  muscle_mass numeric(5, 2) check (muscle_mass between 5 and 150),
  source text not null default 'manual' check (source in ('manual', 'apple_health', 'import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);
comment on column public.body_metrics.weight is 'kg';
create trigger body_metrics_set_updated_at before update on public.body_metrics
  for each row execute function public.set_updated_at();

create table public.health_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  sleep_minutes int check (sleep_minutes between 0 and 1440),
  hrv numeric(5, 1) check (hrv between 1 and 300),
  resting_hr int check (resting_hr between 25 and 150),
  steps int check (steps between 0 and 200000),
  active_calories int check (active_calories between 0 and 20000),
  vo2max numeric(4, 1) check (vo2max between 10 and 100),
  source text not null default 'manual' check (source in ('manual', 'apple_health', 'import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);
comment on column public.health_metrics.date is 'the morning the values belong to (sleep = the night before)';
comment on column public.health_metrics.hrv is 'ms; Apple Health reports SDNN';
create trigger health_metrics_set_updated_at before update on public.health_metrics
  for each row execute function public.set_updated_at();

create table public.readiness_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  soreness smallint check (soreness between 1 and 5),
  fatigue smallint check (fatigue between 1 and 5),
  motivation smallint check (motivation between 1 and 5),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);
comment on column public.readiness_checkins.soreness is '1 = none, 5 = very sore';
comment on column public.readiness_checkins.fatigue is '1 = fresh, 5 = exhausted';
comment on column public.readiness_checkins.motivation is '1 = low, 5 = high';
create trigger readiness_checkins_set_updated_at before update on public.readiness_checkins
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- AI coach integration
-- -----------------------------------------------------------------------------
create table public.coach_api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  token_prefix text not null check (char_length(token_prefix) <= 16),
  scopes text[] not null default '{read,write}' check (scopes <@ array['read', 'write']::text[] and cardinality(scopes) > 0),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.coach_api_tokens is 'Bearer tokens for the external AI coach. Only the SHA-256 hash is stored.';
create index coach_api_tokens_user_idx on public.coach_api_tokens (user_id);

create table public.api_request_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,
  token_id uuid references public.coach_api_tokens (id) on delete set null,
  method text not null,
  path text not null,
  status int not null,
  duration_ms int,
  ip text,
  user_agent text,
  error text,
  created_at timestamptz not null default now()
);
create index api_request_logs_token_time_idx on public.api_request_logs (token_id, created_at desc);
create index api_request_logs_user_time_idx on public.api_request_logs (user_id, created_at desc);
create index api_request_logs_ip_time_idx on public.api_request_logs (ip, created_at desc) where token_id is null;

create table public.coach_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  category text not null default 'general'
    check (category in ('training', 'recovery', 'body', 'running', 'hyrox', 'general')),
  title text check (char_length(title) <= 120),
  body text not null check (char_length(body) between 1 and 2000),
  created_by text not null default 'AI' check (created_by in ('AI', 'USER')),
  created_at timestamptz not null default now()
);
create index coach_insights_user_date_idx on public.coach_insights (user_id, date desc, created_at desc);

-- ===== 20261006000200_rls_and_grants.sql =====
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

-- ===== 20261006000300_analytics_views.sql =====
-- =============================================================================
-- Analytics views used by the app and the AI coach context.
-- security_invoker = true: the caller's RLS applies to the underlying tables,
-- so a signed-in user only ever aggregates their own sets.
-- e1RM uses the Epley formula (weight * (1 + reps / 30)) for 1-12 rep sets.
-- =============================================================================

-- One row per (session, exercise): what was done in that session.
create view public.exercise_session_stats
with (security_invoker = true) as
select
  ws.user_id,
  ws.session_id,
  s.date,
  s.started_at,
  s.workout_type,
  ws.exercise_id,
  count(*) filter (where not ws.is_warmup) as working_sets,
  max(ws.weight) filter (where not ws.is_warmup) as top_weight,
  round(max(ws.weight * (1 + ws.reps / 30.0))
    filter (where not ws.is_warmup and ws.weight > 0 and ws.reps between 1 and 12), 1) as best_e1rm,
  round(sum(coalesce(ws.weight, 0) * coalesce(ws.reps, 0)) filter (where not ws.is_warmup), 1) as volume_kg,
  sum(ws.reps) filter (where not ws.is_warmup) as total_reps,
  max(ws.reps) filter (where not ws.is_warmup) as max_reps,
  sum(ws.distance) filter (where not ws.is_warmup) as total_distance_m,
  sum(ws.time_seconds) filter (where not ws.is_warmup) as total_time_seconds,
  min(ws.time_seconds) filter (where not ws.is_warmup and ws.time_seconds > 0) as best_time_seconds,
  round(avg(ws.rpe) filter (where not ws.is_warmup), 1) as avg_rpe
from public.workout_sets ws
join public.workout_sessions s on s.id = ws.session_id and s.user_id = ws.user_id
where s.status <> 'abandoned'
group by ws.user_id, ws.session_id, s.date, s.started_at, s.workout_type, ws.exercise_id;

comment on view public.exercise_session_stats is 'Per-session, per-exercise summary (working sets only).';

-- Personal bests, one row per (exercise, pb_type).
--   heaviest  : heaviest working set (ties broken by reps)
--   e1rm      : best estimated 1RM (Epley, 1-12 reps)
--   most_reps : most reps in a single set
--   fastest   : fastest time at the exercise's standard distance (e.g. SkiErg 1000 m)
create view public.exercise_personal_bests
with (security_invoker = true) as
with valid as (
  select ws.user_id, ws.exercise_id, ws.weight, ws.reps, ws.distance, ws.time_seconds, s.date, ws.completed_at
  from public.workout_sets ws
  join public.workout_sessions s on s.id = ws.session_id and s.user_id = ws.user_id
  where s.status <> 'abandoned' and not ws.is_warmup
)
select * from (
  select distinct on (user_id, exercise_id)
    user_id, exercise_id, 'heaviest'::text as pb_type, weight, reps, distance, time_seconds,
    null::numeric as e1rm, date
  from valid
  where weight > 0 and coalesce(reps, 1) > 0
  order by user_id, exercise_id, weight desc, reps desc nulls last, completed_at
) heaviest
union all
select * from (
  select distinct on (user_id, exercise_id)
    user_id, exercise_id, 'e1rm'::text, weight, reps, distance, time_seconds,
    round(weight * (1 + reps / 30.0), 1), date
  from valid
  where weight > 0 and reps between 1 and 12
  order by user_id, exercise_id, weight * (1 + reps / 30.0) desc, completed_at
) best_e1rm
union all
select * from (
  select distinct on (user_id, exercise_id)
    user_id, exercise_id, 'most_reps'::text, weight, reps, distance, time_seconds,
    null::numeric, date
  from valid
  where reps > 0
  order by user_id, exercise_id, reps desc, weight desc nulls last, completed_at
) most_reps
union all
select * from (
  select distinct on (v.user_id, v.exercise_id)
    v.user_id, v.exercise_id, 'fastest'::text, v.weight, v.reps, v.distance, v.time_seconds,
    null::numeric, v.date
  from valid v
  join public.exercise_master em on em.id = v.exercise_id
  where v.time_seconds > 0 and em.default_distance_m is not null and v.distance = em.default_distance_m
  order by v.user_id, v.exercise_id, v.time_seconds, v.completed_at
) fastest;

comment on view public.exercise_personal_bests is 'Personal bests per exercise and PB type (heaviest, e1rm, most_reps, fastest).';

revoke all on public.exercise_session_stats, public.exercise_personal_bests from anon, authenticated;
grant select on public.exercise_session_stats, public.exercise_personal_bests to authenticated, service_role;

-- ===== 20261006000400_exercise_master_data.sql =====
-- =============================================================================
-- Built-in exercise master (owner_id = null). IDs are stable API identifiers:
-- the AI coach refers to exercises by these ids (e.g. "bench_press").
-- Users can override weight_increment / default_rest_seconds per exercise in
-- user_exercise_settings, and add their own exercises (owner_id = user).
-- =============================================================================

insert into public.exercise_master
  (id, name, category, primary_muscle, secondary_muscles, hyrox_relevance, is_hyrox_station, hyrox_station_order,
   unit_type, weight_increment, default_rest_seconds, default_distance_m, aliases)
values
  -- Upper body
  ('bench_press', 'Bench Press', 'push', 'chest', '{triceps,front_delts}', 1, false, null,
   'weight_reps', 2.5, 120, null, '{bench,bp,ベンチプレス}'),
  ('pull_up', 'Pull Up', 'pull', 'lats', '{biceps,rear_delts,grip}', 2, false, null,
   'bodyweight_reps', 2.5, 120, null, '{pullup,chin_up,懸垂}'),
  ('lat_pulldown', 'Lat Pulldown', 'pull', 'lats', '{biceps,rear_delts}', 2, false, null,
   'weight_reps', 2.5, 90, null, '{pulldown,ラットプルダウン}'),
  ('seated_row', 'Seated Row', 'pull', 'upper_back', '{lats,biceps,rear_delts}', 2, false, null,
   'weight_reps', 2.5, 90, null, '{cable_row,シーテッドロウ}'),
  ('db_shoulder_press', 'DB Shoulder Press', 'push', 'shoulders', '{triceps,upper_chest}', 1, false, null,
   'weight_reps', 2, 90, null, '{dumbbell_shoulder_press,ショルダープレス}'),
  ('straight_arm_pulldown', 'Straight Arm Pulldown', 'pull', 'lats', '{triceps,core}', 2, false, null,
   'weight_reps', 2.5, 60, null, '{straight_arm_pushdown}'),
  ('incline_db_press', 'Incline DB Press', 'push', 'upper_chest', '{front_delts,triceps}', 1, false, null,
   'weight_reps', 2, 90, null, '{incline_dumbbell_press}'),
  ('db_row', 'DB Row', 'pull', 'upper_back', '{lats,biceps}', 2, false, null,
   'weight_reps', 2, 90, null, '{dumbbell_row,one_arm_row}'),
  ('face_pull', 'Face Pull', 'pull', 'rear_delts', '{upper_back,rotator_cuff}', 1, false, null,
   'weight_reps', 2.5, 60, null, '{}'),
  ('push_up', 'Push Up', 'push', 'chest', '{triceps,core}', 2, false, null,
   'bodyweight_reps', 2.5, 60, null, '{pushup,腕立て伏せ}'),

  -- Lower body
  ('squat', 'Squat', 'legs', 'quads', '{glutes,adductors,core}', 2, false, null,
   'weight_reps', 2.5, 150, null, '{back_squat,スクワット}'),
  ('deadlift', 'Deadlift', 'hinge', 'glutes', '{hamstrings,lower_back,grip,traps}', 2, false, null,
   'weight_reps', 2.5, 180, null, '{dl,デッドリフト}'),
  ('romanian_deadlift', 'Romanian Deadlift', 'hinge', 'hamstrings', '{glutes,lower_back,grip}', 2, false, null,
   'weight_reps', 2.5, 120, null, '{rdl}'),
  ('bulgarian_split_squat', 'Bulgarian Split Squat', 'legs', 'quads', '{glutes,adductors}', 3, false, null,
   'weight_reps', 2, 90, null, '{bss,split_squat}'),
  ('walking_lunge', 'Walking Lunge', 'legs', 'quads', '{glutes,hamstrings}', 3, false, null,
   'weight_reps', 2, 90, null, '{lunge,ランジ}'),
  ('leg_press', 'Leg Press', 'legs', 'quads', '{glutes}', 2, false, null,
   'weight_reps', 5, 120, null, '{}'),
  ('hip_thrust', 'Hip Thrust', 'hinge', 'glutes', '{hamstrings}', 2, false, null,
   'weight_reps', 2.5, 90, null, '{}'),

  -- Conditioning
  ('kettlebell_swing', 'Kettlebell Swing', 'hinge', 'glutes', '{hamstrings,lower_back,grip}', 2, false, null,
   'weight_reps', 4, 60, null, '{kb_swing}'),
  ('box_jump', 'Box Jump', 'legs', 'quads', '{glutes,calves}', 2, false, null,
   'reps', 2.5, 60, null, '{}'),
  ('bike_erg', 'BikeErg', 'cardio', 'quads', '{glutes,calves}', 2, false, null,
   'distance_time', 2.5, 90, 2000, '{bike,assault_bike}'),
  ('plank', 'Plank', 'core', 'core', '{shoulders}', 1, false, null,
   'time', 2.5, 60, null, '{プランク}'),

  -- HYROX stations (official race order)
  ('ski_erg', 'SkiErg', 'hyrox_station', 'lats', '{triceps,core,shoulders}', 3, true, 1,
   'distance_time', 2.5, 120, 1000, '{ski,skierg,スキーエルグ}'),
  ('sled_push', 'Sled Push', 'hyrox_station', 'quads', '{glutes,calves,shoulders,triceps}', 3, true, 2,
   'weight_distance', 5, 120, 50, '{sled_push,スレッドプッシュ}'),
  ('sled_pull', 'Sled Pull', 'hyrox_station', 'upper_back', '{lats,biceps,grip,hamstrings}', 3, true, 3,
   'weight_distance', 5, 120, 50, '{sled_pull,スレッドプル}'),
  ('burpee_broad_jump', 'Burpee Broad Jump', 'hyrox_station', 'quads', '{chest,glutes,shoulders}', 3, true, 4,
   'distance_time', 2.5, 120, 80, '{bbj,burpee,バーピーブロードジャンプ}'),
  ('row_erg', 'RowErg', 'hyrox_station', 'upper_back', '{quads,glutes,biceps}', 3, true, 5,
   'distance_time', 2.5, 120, 1000, '{row,rowing,ローイング}'),
  ('farmers_carry', 'Farmer''s Carry', 'hyrox_station', 'grip', '{traps,core,glutes}', 3, true, 6,
   'weight_distance', 2, 90, 200, '{farmers_walk,farmer_carry,ファーマーズキャリー}'),
  ('sandbag_lunges', 'Sandbag Lunges', 'hyrox_station', 'quads', '{glutes,core}', 3, true, 7,
   'weight_distance', 2.5, 120, 100, '{sandbag_lunge,サンドバッグランジ}'),
  ('wall_ball', 'Wall Ball', 'hyrox_station', 'quads', '{shoulders,glutes,core}', 3, true, 8,
   'weight_reps', 1, 90, null, '{wall_balls,wallball,ウォールボール}'),

  -- Running (used inside plans, e.g. 6 x 1 km)
  ('running', 'Running', 'run', 'legs', '{cardio}', 3, false, null,
   'distance_time', 2.5, 90, 1000, '{run,ランニング}');

-- ===== 20261006000500_write_functions.sql =====
-- =============================================================================
-- Transactional write helpers (parent + children in one statement).
--
-- SECURITY INVOKER: when the app calls these with a user session, RLS applies,
-- so p_user_id must be the caller (inserting rows for anyone else fails the
-- RLS check). The coach API calls them with the service role only after the
-- bearer token has been verified and p_user_id is the token owner.
-- =============================================================================

create or replace function public.create_workout_plan(
  p_user_id uuid,
  p_plan jsonb,
  p_exercises jsonb,
  p_replace_existing boolean default false
)
returns table (plan_id uuid, created boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_date date := (p_plan ->> 'date')::date;
  v_key text := nullif(p_plan ->> 'idempotency_key', '');
begin
  if v_key is not null then
    select wp.id into v_plan_id
      from public.workout_plans wp
     where wp.user_id = p_user_id and wp.idempotency_key = v_key;
    if found then
      return query select v_plan_id, false;
      return;
    end if;
  end if;

  if p_replace_existing then
    update public.workout_plans wp
       set status = 'cancelled'
     where wp.user_id = p_user_id and wp.date = v_date and wp.status = 'planned';
  end if;

  insert into public.workout_plans
    (user_id, date, title, workout_type, status, created_by, coach_reason, estimated_duration_min, source, idempotency_key)
  values (
    p_user_id,
    v_date,
    p_plan ->> 'title',
    p_plan ->> 'workout_type',
    'planned',
    coalesce(p_plan ->> 'created_by', 'USER'),
    p_plan ->> 'coach_reason',
    (p_plan ->> 'estimated_duration_min')::int,
    p_plan ->> 'source',
    v_key
  )
  returning id into v_plan_id;

  insert into public.workout_plan_exercises
    (workout_plan_id, user_id, order_index, exercise_id, target_sets, target_reps_min, target_reps_max, target_weight,
     target_distance, target_time, target_rpe, target_pace_min, target_pace_max, target_hr_zone, rest_seconds, coach_note)
  select v_plan_id, p_user_id, e.order_index, e.exercise_id, e.target_sets, e.target_reps_min, e.target_reps_max,
         e.target_weight, e.target_distance, e.target_time, e.target_rpe, e.target_pace_min, e.target_pace_max,
         e.target_hr_zone, e.rest_seconds, e.coach_note
    from jsonb_to_recordset(coalesce(p_exercises, '[]'::jsonb)) as e(
      order_index int, exercise_id text, target_sets int, target_reps_min int, target_reps_max int,
      target_weight numeric, target_distance numeric, target_time int, target_rpe numeric,
      target_pace_min int, target_pace_max int, target_hr_zone smallint, rest_seconds int, coach_note text);

  return query select v_plan_id, true;
end;
$$;

comment on function public.create_workout_plan is
  'Creates a plan and its exercises atomically. Optional idempotency_key returns the existing plan instead of a duplicate. p_replace_existing cancels other not-yet-started plans on the same date.';

create or replace function public.replace_workout_plan(
  p_user_id uuid,
  p_plan_id uuid,
  p_plan jsonb,
  p_exercises jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.workout_plans wp
     set date = coalesce((p_plan ->> 'date')::date, wp.date),
         title = coalesce(p_plan ->> 'title', wp.title),
         workout_type = coalesce(p_plan ->> 'workout_type', wp.workout_type),
         coach_reason = case when p_plan ? 'coach_reason' then p_plan ->> 'coach_reason' else wp.coach_reason end,
         estimated_duration_min = case when p_plan ? 'estimated_duration_min'
                                       then (p_plan ->> 'estimated_duration_min')::int else wp.estimated_duration_min end
   where wp.id = p_plan_id and wp.user_id = p_user_id and wp.status = 'planned'
  returning wp.id into v_id;

  if v_id is null then
    raise exception 'workout plan % not found or already started', p_plan_id using errcode = 'P0002';
  end if;

  if p_exercises is not null then
    delete from public.workout_plan_exercises wpe where wpe.workout_plan_id = p_plan_id and wpe.user_id = p_user_id;
    insert into public.workout_plan_exercises
      (workout_plan_id, user_id, order_index, exercise_id, target_sets, target_reps_min, target_reps_max, target_weight,
       target_distance, target_time, target_rpe, target_pace_min, target_pace_max, target_hr_zone, rest_seconds, coach_note)
    select p_plan_id, p_user_id, e.order_index, e.exercise_id, e.target_sets, e.target_reps_min, e.target_reps_max,
           e.target_weight, e.target_distance, e.target_time, e.target_rpe, e.target_pace_min, e.target_pace_max,
           e.target_hr_zone, e.rest_seconds, e.coach_note
      from jsonb_to_recordset(p_exercises) as e(
        order_index int, exercise_id text, target_sets int, target_reps_min int, target_reps_max int,
        target_weight numeric, target_distance numeric, target_time int, target_rpe numeric,
        target_pace_min int, target_pace_max int, target_hr_zone smallint, rest_seconds int, coach_note text);
  end if;

  return v_id;
end;
$$;

comment on function public.replace_workout_plan is
  'Updates a not-yet-started plan; when p_exercises is given, replaces all of its exercises atomically.';

create or replace function public.create_hyrox_result(
  p_user_id uuid,
  p_result jsonb,
  p_splits jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.hyrox_results
    (user_id, workout_plan_id, date, event_type, division, name, status, total_seconds, run_total_seconds,
     station_total_seconds, roxzone_seconds, notes, started_at, finished_at)
  values (
    p_user_id,
    (p_result ->> 'workout_plan_id')::uuid,
    (p_result ->> 'date')::date,
    p_result ->> 'event_type',
    p_result ->> 'division',
    p_result ->> 'name',
    coalesce(p_result ->> 'status', 'completed'),
    (p_result ->> 'total_seconds')::int,
    (p_result ->> 'run_total_seconds')::int,
    (p_result ->> 'station_total_seconds')::int,
    (p_result ->> 'roxzone_seconds')::int,
    p_result ->> 'notes',
    (p_result ->> 'started_at')::timestamptz,
    (p_result ->> 'finished_at')::timestamptz
  )
  returning id into v_id;

  insert into public.hyrox_splits (user_id, result_id, segment_index, segment_type, exercise_id, duration_seconds, roxzone_seconds)
  select p_user_id, v_id, s.segment_index, s.segment_type, s.exercise_id, s.duration_seconds, s.roxzone_seconds
    from jsonb_to_recordset(coalesce(p_splits, '[]'::jsonb)) as s(
      segment_index smallint, segment_type text, exercise_id text, duration_seconds int, roxzone_seconds int);

  if (p_result ->> 'workout_plan_id') is not null then
    update public.workout_plans wp set status = 'completed'
     where wp.id = (p_result ->> 'workout_plan_id')::uuid and wp.user_id = p_user_id;
  end if;

  return v_id;
end;
$$;

comment on function public.create_hyrox_result is 'Stores a HYROX race/simulation with its splits atomically.';

revoke execute on function public.create_workout_plan(uuid, jsonb, jsonb, boolean) from public, anon;
revoke execute on function public.replace_workout_plan(uuid, uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.create_hyrox_result(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.create_workout_plan(uuid, jsonb, jsonb, boolean) to authenticated, service_role;
grant execute on function public.replace_workout_plan(uuid, uuid, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.create_hyrox_result(uuid, jsonb, jsonb) to authenticated, service_role;

-- ===== migration history =====
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20261006000100', 'core_schema'),
  ('20261006000200', 'rls_and_grants'),
  ('20261006000300', 'analytics_views'),
  ('20261006000400', 'exercise_master_data'),
  ('20261006000500', 'write_functions')
on conflict (version) do nothing;
