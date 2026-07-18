-- 1. Helper security definer functions to bypass RLS recursion
create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid)
returns boolean security definer set search_path = public as $$
begin
  return exists (
    select 1 from public.group_members
    where group_members.group_id = p_group_id
    and group_members.profile_id = p_user_id
  );
end;
$$ language plpgsql;

create or replace function public.is_group_admin(p_group_id uuid, p_user_id uuid)
returns boolean security definer set search_path = public as $$
begin
  return exists (
    select 1 from public.group_members
    where group_members.group_id = p_group_id
    and group_members.profile_id = p_user_id
    and group_members.role = 'admin'
  );
end;
$$ language plpgsql;

-- 2. Drop existing recursive policies
drop policy if exists "Members can select group membership list" on public.group_members;
drop policy if exists "Admins can delete members" on public.group_members;
drop policy if exists "Members can view groups they belong to" on public.groups;
drop policy if exists "Admins can update group details" on public.groups;
drop policy if exists "Admins/Owners can delete groups" on public.groups;
drop policy if exists "Members can view expenses in their groups" on public.expenses;
drop policy if exists "Members can create expenses in their groups" on public.expenses;
drop policy if exists "Members can view splits in their groups" on public.expense_splits;
drop policy if exists "Members can create splits in their groups" on public.expense_splits;
drop policy if exists "Members can select peer balances" on public.peer_balances;
drop policy if exists "Members can view water jar logs in their groups" on public.water_jar_logs;
drop policy if exists "Members can log water jars in their groups" on public.water_jar_logs;

-- 3. Recreate policies utilizing the security definer functions
create policy "Members can select group membership list"
  on public.group_members for select
  using (public.is_group_member(group_id, auth.uid()));

create policy "Admins can delete members"
  on public.group_members for delete
  using (public.is_group_admin(group_id, auth.uid()));

create policy "Members can view groups they belong to"
  on public.groups for select
  using (created_by = auth.uid() or public.is_group_member(id, auth.uid()));

create policy "Admins can update group details"
  on public.groups for update
  using (public.is_group_admin(id, auth.uid()));

create policy "Members can view expenses in their groups"
  on public.expenses for select
  using (public.is_group_member(group_id, auth.uid()));

create policy "Members can create expenses in their groups"
  on public.expenses for insert
  with check (public.is_group_member(group_id, auth.uid()));

create policy "Members can view splits in their groups"
  on public.expense_splits for select
  using (
    exists (
      select 1 from public.expenses
      where expenses.id = expense_id
      and public.is_group_member(expenses.group_id, auth.uid())
    )
  );

create policy "Members can create splits in their groups"
  on public.expense_splits for insert
  with check (
    exists (
      select 1 from public.expenses
      where expenses.id = expense_id
      and public.is_group_member(expenses.group_id, auth.uid())
    )
  );

create policy "Members can select peer balances"
  on public.peer_balances for select
  using (public.is_group_member(group_id, auth.uid()));

create policy "Members can view water jar logs in their groups"
  on public.water_jar_logs for select
  using (public.is_group_member(group_id, auth.uid()));

create policy "Members can log water jars in their groups"
  on public.water_jar_logs for insert
  with check (public.is_group_member(group_id, auth.uid()));

create policy "Admins/Owners can delete groups"
  on public.groups for delete
  using (created_by = auth.uid() or public.is_group_admin(id, auth.uid()));
