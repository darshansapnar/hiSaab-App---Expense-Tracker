-- Drop existing policies on profiles table
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
drop policy if exists "Users can update their own profile." on public.profiles;
drop policy if exists "Users can read their own profile." on public.profiles;
drop policy if exists "Users can insert their own profile." on public.profiles;

-- 1. Users can only read their own profile
create policy "Users can read their own profile." on public.profiles
  for select using (auth.uid() = id);

-- 2. Users can only insert a profile where id = auth.uid()
create policy "Users can insert their own profile." on public.profiles
  for insert with check (auth.uid() = id);

-- 3. Users can only update their own profile
create policy "Users can update their own profile." on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
