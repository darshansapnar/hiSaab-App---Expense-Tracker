-- Drop the old policy
drop policy if exists "Admins can delete members" on public.group_members;

-- Create the new policy allowing users to delete themselves OR admins to delete anyone
create policy "Admins can delete members or users can leave"
  on public.group_members for delete
  using (auth.uid() = profile_id or public.is_group_admin(group_id, auth.uid()));
