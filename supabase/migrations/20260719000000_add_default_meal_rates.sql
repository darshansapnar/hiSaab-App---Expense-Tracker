-- Add default meal rate columns to profiles for tiffin tracker configuration persistence
alter table public.profiles 
add column if not exists default_breakfast_rate numeric(10,2) default 30.00,
add column if not exists default_dinner_rate numeric(10,2) default 30.00;
