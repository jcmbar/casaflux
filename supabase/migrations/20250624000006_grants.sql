grant execute on function public.is_family_member(uuid, uuid) to authenticated;
grant execute on function public.is_family_admin(uuid, uuid) to authenticated;
grant execute on function public.can_view_account(uuid, uuid) to authenticated;
grant execute on function public.can_post_to_account(uuid, uuid) to authenticated;
grant execute on function public.can_edit_account(uuid, uuid) to authenticated;
grant execute on function public.can_manage_family_members(uuid, uuid) to authenticated;
grant execute on function public.can_create_family_invitation(uuid, uuid) to authenticated;
grant execute on function public.can_edit_transaction(uuid, uuid) to authenticated;
grant execute on function public.generate_family_slug(text) to authenticated;
