-- Reference data (exercise master) lives in migrations so every environment has it.
-- Demo/athlete sample data needs a real Auth user, so it is created with the
-- Auth admin API instead of raw SQL:
--
--   npm run seed            # creates demo@hyrox.local and 42 days of data
--
-- This file is intentionally empty so `supabase db reset` stays fast.
select 1;
