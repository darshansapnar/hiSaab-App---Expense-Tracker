-- Create profiles table (references auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  display_name text,
  avatar_url text,
  push_token text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on profiles
alter table public.profiles enable row level security;

-- Profiles Policies
create policy "Public profiles are viewable by everyone." on public.profiles
  for select using (true);

create policy "Users can update their own profile." on public.profiles
  for update using (auth.uid() = id);

-- Create profile sync trigger on auth.users registration
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', '👋')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Re-create user creation trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Create groups table
create table if not exists public.groups (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  avatar_url text,
  type text check (type in ('hostel', 'flatmates', 'trip', 'couple', 'family', 'other')) default 'other',
  currency text default 'INR' not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create group members association table
create table if not exists public.group_members (
  group_id uuid references public.groups(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  role text check (role in ('admin', 'member')) default 'member',
  primary key (group_id, profile_id)
);

-- Enable RLS on groups & members
alter table public.groups enable row level security;
alter table public.group_members enable row level security;

-- Groups Select/Insert/Update RLS Policies
create policy "Members can view groups they belong to"
  on public.groups for select
  using (
    exists (
      select 1 from public.group_members
      where group_members.group_id = id
      and group_members.profile_id = auth.uid()
    )
  );

create policy "Users can create groups"
  on public.groups for insert
  with check (auth.uid() is not null);

create policy "Admins can update group details"
  on public.groups for update
  using (
    exists (
      select 1 from public.group_members
      where group_members.group_id = id
      and group_members.profile_id = auth.uid()
      and group_members.role = 'admin'
    )
  );

-- Group Members RLS Policies
create policy "Members can select group membership list"
  on public.group_members for select
  using (
    exists (
      select 1 from public.group_members as gm
      where gm.group_id = group_id
      and gm.profile_id = auth.uid()
    )
  );

create policy "Users can insert themselves into group members"
  on public.group_members for insert
  with check (auth.uid() = profile_id);

create policy "Admins can delete members"
  on public.group_members for delete
  using (
    exists (
      select 1 from public.group_members as gm
      where gm.group_id = group_id
      and gm.profile_id = auth.uid()
      and gm.role = 'admin'
    )
  );

-- Trigger to automatically add group creator as admin member on insert
create or replace function public.add_creator_as_member()
returns trigger as $$
begin
  if new.created_by is not null then
    insert into public.group_members (group_id, profile_id, role)
    values (new.id, new.created_by, 'admin')
    on conflict (group_id, profile_id) do nothing;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Re-create group create trigger
drop trigger if exists on_group_created on public.groups;
create trigger on_group_created
  after insert on public.groups
  for each row execute procedure public.add_creator_as_member();
