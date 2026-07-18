-- Add notes column to expenses table if it doesn't exist
alter table public.expenses 
add column if not exists notes text;
