-- 1. Add invite_code column to groups table
alter table public.groups
add column if not exists invite_code text unique;

-- 2. Create a function to generate unique invite codes (6-8 chars, uppercase + digits)
create or replace function public.generate_invite_code()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  code_length int;
  i int;
  max_attempts int := 10;
  attempt int := 0;
begin
  loop
    attempt := attempt + 1;
    code := '';
    -- Random length between 6 and 8
    code_length := 6 + floor(random() * 3)::int;
    for i in 1..code_length loop
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;

    -- Check uniqueness
    if not exists (select 1 from public.groups where invite_code = code) then
      return code;
    end if;

    if attempt >= max_attempts then
      raise exception 'Failed to generate unique invite code after % attempts', max_attempts;
    end if;
  end loop;
end;
$$;

-- 3. Backfill existing groups with invite codes
do $$
declare
  g record;
  new_code text;
begin
  for g in select id from public.groups where invite_code is null loop
    new_code := public.generate_invite_code();
    update public.groups set invite_code = new_code where id = g.id;
  end loop;
end;
$$;

-- 4. Now make it NOT NULL with a default
alter table public.groups
alter column invite_code set default public.generate_invite_code(),
alter column invite_code set not null;

-- 5. Update the create_group_with_admin function to include invite_code
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
  v_invite_code text;
begin
  -- Generate unique invite code
  v_invite_code := public.generate_invite_code();

  -- 1. Insert the group with invite code
  insert into public.groups (name, description, type, currency, created_by, invite_code)
  values (p_name, p_description, p_type, p_currency, p_created_by, v_invite_code)
  returning * into v_group_record;

  v_group_id := v_group_record.id;

  -- 2. Insert the group member (admin/creator)
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

-- 6. Create a function to join a group by invite code
create or replace function public.join_group_by_invite_code(
  p_invite_code text,
  p_user_id uuid
)
returns jsonb
security definer
language plpgsql
as $$
declare
  v_group record;
  v_result jsonb;
begin
  -- Find group by invite code
  select * into v_group
  from public.groups
  where invite_code = upper(trim(p_invite_code));

  if v_group is null then
    raise exception 'Invite code not found.';
  end if;

  -- Check if already a member
  if exists (
    select 1 from public.group_members
    where group_id = v_group.id and profile_id = p_user_id
  ) then
    raise exception 'You''re already in this group.';
  end if;

  -- Add as member
  insert into public.group_members (group_id, profile_id, role)
  values (v_group.id, p_user_id, 'member');

  v_result := jsonb_build_object(
    'group_id', v_group.id,
    'group_name', v_group.name,
    'invite_code', v_group.invite_code
  );

  return v_result;
end;
$$;

-- 7. Create a function to regenerate invite code (admin only)
create or replace function public.regenerate_invite_code(
  p_group_id uuid,
  p_user_id uuid
)
returns text
security definer
language plpgsql
as $$
declare
  v_new_code text;
  v_role text;
begin
  -- Check if user is admin
  select role into v_role
  from public.group_members
  where group_id = p_group_id and profile_id = p_user_id;

  if v_role is null or v_role != 'admin' then
    raise exception 'Only group admins can regenerate invite codes.';
  end if;

  -- Generate new code
  v_new_code := public.generate_invite_code();

  -- Update the group
  update public.groups
  set invite_code = v_new_code
  where id = p_group_id;

  return v_new_code;
end;
$$;
