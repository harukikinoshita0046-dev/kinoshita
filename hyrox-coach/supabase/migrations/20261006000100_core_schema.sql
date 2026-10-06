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
