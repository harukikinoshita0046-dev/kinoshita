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
