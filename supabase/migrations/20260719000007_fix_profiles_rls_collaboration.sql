-- 1. Create a security definer function to check if two users share a group membership
create or replace function public.share_group_membership(p_user_a uuid, p_user_b uuid)
returns boolean security definer set search_path = public as $$
begin
  return exists (
    select 1 from public.group_members as gm1
    join public.group_members as gm2 on gm1.group_id = gm2.group_id
    where gm1.profile_id = p_user_a and gm2.profile_id = p_user_b
  );
end;
$$ language plpgsql;

-- 2. Drop the restrictive select policy on profiles table
drop policy if exists "Users can read their own profile." on public.profiles;

-- 3. Create the collaborative select policy
create policy "Users can read profiles of group members or self"
  on public.profiles for select
  using (auth.uid() = id or public.share_group_membership(auth.uid(), id));
