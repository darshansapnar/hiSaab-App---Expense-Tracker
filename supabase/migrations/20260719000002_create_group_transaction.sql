-- Create an atomic function to create a group and assign the creator as admin
create or replace function public.create_group_with_admin(
  p_name text,
  p_description text,
  p_type text,
  p_currency text,
  p_created_by uuid
)
returns jsonb
security definer
language plpgsql
as $$
declare
  v_group_id uuid;
  v_group_record record;
  v_result jsonb;
begin
  -- 1. Insert the group
  insert into public.groups (name, description, type, currency, created_by)
  values (p_name, p_description, p_type, p_currency, p_created_by)
  returning * into v_group_record;

  v_group_id := v_group_record.id;

  -- 2. Insert the group member (admin/creator) if not already inserted by the database trigger
  insert into public.group_members (group_id, profile_id, role)
  values (v_group_id, p_created_by, 'admin')
  on conflict (group_id, profile_id) do update
  set role = 'admin';

  -- 3. Return the created group record as jsonb
  v_result := to_jsonb(v_group_record);
  return v_result;
exception
  when unique_violation then
    raise exception 'This member is already part of the group.';
  when others then
    raise exception 'Couldn''t create the group. Please try again.';
end;
$$;
