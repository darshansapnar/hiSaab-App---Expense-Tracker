-- Migrate any existing expenses in 'Water Jar' category to 'Other' to preserve user data
update public.expenses
set category_id = (select id from public.categories where name = 'Other' limit 1)
where category_id = (select id from public.categories where name = 'Water Jar' limit 1);

-- Delete 'Water Jar' category from categories table
delete from public.categories
where name = 'Water Jar';

-- Drop the water_jar_logs table and its related RLS policies
drop table if exists public.water_jar_logs cascade;
