-- Create water jar logs table
create table if not exists public.water_jar_logs (
  id uuid default gen_random_uuid() primary key,
  group_id uuid references public.groups(id) on delete cascade not null,
  logged_by uuid references public.profiles(id) on delete set null,
  quantity integer check (quantity > 0) default 1 not null,
  rate decimal(10,2) check (rate >= 0) default 30.00 not null,
  delivery_date date default current_date not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on water_jar_logs
alter table public.water_jar_logs enable row level security;

-- Water Jar Logs RLS Policies
create policy "Members can view water jar logs in their groups"
  on public.water_jar_logs for select
  using (
    exists (
      select 1 from public.group_members
      where group_members.group_id = water_jar_logs.group_id
      and group_members.profile_id = auth.uid()
    )
  );

create policy "Members can log water jars in their groups"
  on public.water_jar_logs for insert
  with check (
    exists (
      select 1 from public.group_members
      where group_members.group_id = group_id
      and group_members.profile_id = auth.uid()
    )
  );

create policy "Log creator can delete water jar logs"
  on public.water_jar_logs for delete
  using (auth.uid() = logged_by);
