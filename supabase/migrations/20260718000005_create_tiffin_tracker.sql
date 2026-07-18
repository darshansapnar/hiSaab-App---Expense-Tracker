-- Create tiffin logs table
create table if not exists public.tiffin_logs (
  id uuid default gen_random_uuid() primary key,
  profile_id uuid references public.profiles(id) on delete cascade not null,
  log_date date default current_date not null,
  has_breakfast boolean default false not null,
  has_lunch boolean default false not null,
  has_dinner boolean default false not null,
  breakfast_rate decimal(10,2) default 40.00 not null,
  lunch_rate decimal(10,2) default 80.00 not null,
  dinner_rate decimal(10,2) default 80.00 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  -- Ensure unique entry per day per user
  unique (profile_id, log_date)
);

-- Enable RLS on tiffin_logs
alter table public.tiffin_logs enable row level security;

-- Tiffin Logs RLS Policies
create policy "Users can view their own tiffin logs"
  on public.tiffin_logs for select
  using (auth.uid() = profile_id);

create policy "Users can insert their own tiffin logs"
  on public.tiffin_logs for insert
  with check (auth.uid() = profile_id);

create policy "Users can update their own tiffin logs"
  on public.tiffin_logs for update
  using (auth.uid() = profile_id);

create policy "Users can delete their own tiffin logs"
  on public.tiffin_logs for delete
  using (auth.uid() = profile_id);
