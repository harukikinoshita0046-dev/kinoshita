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
