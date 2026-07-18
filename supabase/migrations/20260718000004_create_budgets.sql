-- Create budgets table
create table if not exists public.budgets (
  id uuid default gen_random_uuid() primary key,
  profile_id uuid references public.profiles(id) on delete cascade unique not null,
  monthly_limit decimal(12,2) check (monthly_limit >= 0) default 0.00 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on budgets
alter table public.budgets enable row level security;

-- Budgets RLS Policies
create policy "Users can view their own budget"
  on public.budgets for select
  using (auth.uid() = profile_id);

create policy "Users can insert their own budget"
  on public.budgets for insert
  with check (auth.uid() = profile_id);

create policy "Users can update their own budget"
  on public.budgets for update
  using (auth.uid() = profile_id);
