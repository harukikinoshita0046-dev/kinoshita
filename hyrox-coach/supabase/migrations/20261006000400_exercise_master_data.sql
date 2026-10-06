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
