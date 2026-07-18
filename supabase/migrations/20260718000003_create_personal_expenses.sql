-- Create personal expenses table
create table if not exists public.personal_expenses (
  id uuid default gen_random_uuid() primary key,
  profile_id uuid references public.profiles(id) on delete cascade not null,
  amount decimal(12,2) check (amount > 0) not null,
  description text not null,
  category_id uuid references public.categories(id) on delete restrict not null,
  expense_date timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on personal_expenses
alter table public.personal_expenses enable row level security;

-- Personal Expenses RLS Policies
create policy "Users can view their own personal expenses"
  on public.personal_expenses for select
  using (auth.uid() = profile_id);

create policy "Users can insert their own personal expenses"
  on public.personal_expenses for insert
  with check (auth.uid() = profile_id);

create policy "Users can update their own personal expenses"
  on public.personal_expenses for update
  using (auth.uid() = profile_id);

create policy "Users can delete their own personal expenses"
  on public.personal_expenses for delete
  using (auth.uid() = profile_id);
