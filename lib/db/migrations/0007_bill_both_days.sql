-- Charge both the issue day and the return day (or today, for items still out).
-- Issued 3 Nov, back 4 Nov = 2 days, matching the "Day 2" the app shows.
UPDATE "settings"
SET "billing" = jsonb_set("billing", '{day_count_mode}', '"inclusive_both"')
WHERE "billing"->>'day_count_mode' = 'inclusive_start';
