-- Self-service deletion uses the authenticated identity, never a client-supplied user ID.
create or replace function studyflow_private.delete_own_account(
  p_confirmation_email text, p_expected_revision bigint
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := auth.uid();
  caller_email text;
  session_key text := auth.jwt()->>'session_id';
  account_revision bigint;
  affected_ids uuid[] := '{}';
  detached_ids uuid[] := '{}';
  membership_ids uuid[] := '{}';
begin
  if caller_id is null then
    raise exception 'STUDYFLOW_ACCOUNT_ACCESS_DENIED' using errcode='42501';
  end if;
  select lower(btrim(u.email)) into caller_email from auth.users u where u.id=caller_id;
  if caller_email is null or p_confirmation_email is null
     or lower(btrim(p_confirmation_email)) is distinct from caller_email then
    raise exception 'STUDYFLOW_ACCOUNT_CONFIRMATION_REQUIRED' using errcode='42501';
  end if;
  -- Password confirmation in the app creates a new session. Reject old or revoked sessions.
  if not exists (
    select 1 from auth.sessions s where s.user_id=caller_id and s.id::text=session_key
      and s.created_at >= now()-interval '5 minutes'
      and (s.not_after is null or s.not_after>now())
  ) then
    raise exception 'STUDYFLOW_RECENT_SIGN_IN_REQUIRED' using errcode='42501';
  end if;
  -- This app has no uploads. Leave future Storage files for deletion through the Storage API.
  if exists(select 1 from storage.objects o where o.owner=caller_id or o.owner_id=caller_id::text) then
    raise exception 'STUDYFLOW_ACCOUNT_HAS_FILES' using errcode='23503';
  end if;

  select coalesce(array_agg(distinct affected.user_id),'{}'::uuid[]) into affected_ids
  from (
    select i.owner_id as user_id from public.studyflow_items i
      join public.studyflow_groups g on g.id=i.group_id where g.owner_id=caller_id
    union
    select g.owner_id from public.studyflow_groups g
      where exists(select 1 from public.studyflow_group_members m where m.group_id=g.id and m.email=caller_email)
        or (jsonb_typeof(g.data->'memberIds')='array' and (g.data->'memberIds') ? caller_email)
  ) affected where affected.user_id<>caller_id;
  -- Follow the account-save lock order. A concurrent change either finishes first or rolls back.
  perform 1 from public.studyflow_settings s
    where s.user_id=caller_id or s.user_id=any(affected_ids) order by s.user_id for update;
  select s.revision into account_revision from public.studyflow_settings s where s.user_id=caller_id;
  if not found or account_revision is distinct from p_expected_revision then
    raise exception 'STUDYFLOW_REVISION_CONFLICT' using errcode='40001';
  end if;

  -- Preserve other members' tasks and all their content, dates, reminders and module snapshots.
  with detached as (
    update public.studyflow_items i set group_id=null,
      data=i.data||jsonb_build_object('groupId','','workType','individual',
        'moduleSnapshot',coalesce(nullif(i.data->'moduleSnapshot','null'::jsonb),g.data->'moduleSnapshot')),
      updated_at=now()
    from public.studyflow_groups g
    where i.group_id=g.id and g.owner_id=caller_id and i.owner_id<>caller_id
    returning i.owner_id
  ) select coalesce(array_agg(distinct owner_id),'{}'::uuid[]) into detached_ids from detached;

  -- Leave groups owned by other accounts and remove the deleted email from their member lists.
  with changed as (
    update public.studyflow_groups g set
      data=jsonb_set(g.data,'{memberIds}',coalesce((
        select jsonb_agg(member.value)
        from jsonb_array_elements(case when jsonb_typeof(g.data->'memberIds')='array'
          then g.data->'memberIds' else '[]'::jsonb end) member(value)
        where lower(btrim(member.value#>>'{}'))<>caller_email
      ),'[]'::jsonb),true),updated_at=now()
    where g.owner_id<>caller_id and (
      exists(select 1 from public.studyflow_group_members m where m.group_id=g.id and m.email=caller_email)
      or (jsonb_typeof(g.data->'memberIds')='array' and (g.data->'memberIds') ? caller_email)
    ) returning g.owner_id
  ) select coalesce(array_agg(distinct owner_id),'{}'::uuid[]) into membership_ids from changed;
  delete from public.studyflow_group_members m where m.email=caller_email;
  affected_ids := array(select distinct unnest(affected_ids||detached_ids||membership_ids));
  -- A stale save must not restore a removed group link or membership.
  update public.studyflow_settings s set revision=s.revision+1,updated_at=now()
    where s.user_id=any(affected_ids);

  delete from public.studyflow_items i where i.owner_id=caller_id;
  delete from public.studyflow_groups g where g.owner_id=caller_id;
  delete from auth.sessions s where s.user_id=caller_id;
  delete from auth.users u where u.id=caller_id;
  return jsonb_build_object('deleted',true);
end;
$$;
revoke all on function studyflow_private.delete_own_account(text,bigint) from public,anon;
grant execute on function studyflow_private.delete_own_account(text,bigint) to authenticated;

create or replace function public.studyflow_delete_account(
  confirmation_email text, expected_revision bigint
) returns jsonb
language sql security invoker set search_path = '' as $$
  select studyflow_private.delete_own_account(confirmation_email,expected_revision);
$$;
revoke all on function public.studyflow_delete_account(text,bigint) from public,anon;
grant execute on function public.studyflow_delete_account(text,bigint) to authenticated;
notify pgrst,'reload schema';
