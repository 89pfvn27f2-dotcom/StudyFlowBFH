-- Assigned group members may change completion only. Existing row policies stay unchanged.
-- Keep the privileged implementation outside the exposed API schema.
create or replace function studyflow_private.complete_task(
  p_task_id text, p_expected_done boolean, p_target_done boolean, p_expected_revision bigint
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := auth.uid();
  caller_email text := lower(btrim(coalesce(auth.jwt()->>'email','')));
  owner_id uuid; locked_owner_id uuid; gid text; task_data jsonb;
  account_revision bigint; actual_done boolean;
begin
  if caller_id is null or p_target_done is null or p_expected_done is null
     or p_task_id is null or length(p_task_id) not between 1 and 120 then
    raise exception 'STUDYFLOW_TASK_ACCESS_DENIED' using errcode='42501';
  end if;
  select i.owner_id,i.group_id,i.data into owner_id,gid,task_data
    from public.studyflow_items i where i.id=p_task_id;
  if not found or task_data->>'kind' is distinct from 'task'
     or (gid is not null and not studyflow_private.can_read_group(gid))
     or (owner_id<>caller_id and (gid is null or caller_email='' or lower(btrim(coalesce(task_data->>'assigneeEmail','')))<>caller_email)) then
    raise exception 'STUDYFLOW_TASK_ACCESS_DENIED' using errcode='42501';
  end if;

  -- Match studyflow_save's lock order: account revision first, item second.
  select s.revision into account_revision from public.studyflow_settings s
    where s.user_id=owner_id for update;
  if not found or (owner_id=caller_id and p_expected_revision is distinct from account_revision) then
    raise exception 'STUDYFLOW_REVISION_CONFLICT' using errcode='40001';
  end if;
  select i.owner_id,i.group_id,i.data into locked_owner_id,gid,task_data
    from public.studyflow_items i where i.id=p_task_id for update;
  if not found or locked_owner_id is distinct from owner_id then
    raise exception 'STUDYFLOW_REVISION_CONFLICT' using errcode='40001';
  end if;
  -- Recheck assignment and current membership after obtaining the locks.
  if task_data->>'kind' is distinct from 'task'
     or (gid is not null and not studyflow_private.can_read_group(gid))
     or (owner_id<>caller_id and (gid is null or caller_email='' or lower(btrim(coalesce(task_data->>'assigneeEmail','')))<>caller_email)) then
    raise exception 'STUDYFLOW_TASK_ACCESS_DENIED' using errcode='42501';
  end if;
  actual_done := coalesce(task_data->'done','false'::jsonb)='true'::jsonb;
  if actual_done<>p_expected_done and actual_done<>p_target_done then
    raise exception 'STUDYFLOW_REVISION_CONFLICT' using errcode='40001';
  end if;
  if actual_done<>p_target_done then
    update public.studyflow_items i
      set data=jsonb_set(task_data,'{done}',to_jsonb(p_target_done),true),updated_at=now()
      where i.id=p_task_id;
    -- An older whole-account save by the creator must not undo a member's completion.
    update public.studyflow_settings s set revision=s.revision+1,updated_at=now()
      where s.user_id=owner_id returning s.revision into account_revision;
  end if;
  return jsonb_build_object('done',p_target_done,'revision',case when owner_id=caller_id then account_revision else null end);
end;
$$;
revoke all on function studyflow_private.complete_task(text,boolean,boolean,bigint) from public,anon;
grant execute on function studyflow_private.complete_task(text,boolean,boolean,bigint) to authenticated;

create or replace function public.studyflow_complete_task(
  task_id text, expected_done boolean, target_done boolean, expected_revision bigint
) returns jsonb
language sql security invoker set search_path = '' as $$
  select studyflow_private.complete_task(task_id,expected_done,target_done,expected_revision);
$$;
revoke all on function public.studyflow_complete_task(text,boolean,boolean,bigint) from public,anon;
grant execute on function public.studyflow_complete_task(text,boolean,boolean,bigint) to authenticated;
notify pgrst,'reload schema';
