-- Synthetic identities only. The entire verification is rolled back; no emails are sent.
begin;
do $$
declare
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
  fresh uuid:=gen_random_uuid(); old_session uuid:=gen_random_uuid(); other_session uuid:=gen_random_uuid();
  prefix text:='sf-delete-'||gen_random_uuid()::text;
begin
  perform set_config('studyflow_delete_test.a',a::text,true);
  perform set_config('studyflow_delete_test.b',b::text,true);
  perform set_config('studyflow_delete_test.c',c::text,true);
  perform set_config('studyflow_delete_test.fresh',fresh::text,true);
  perform set_config('studyflow_delete_test.old',old_session::text,true);
  perform set_config('studyflow_delete_test.prefix',prefix,true);
  perform set_config('studyflow_delete_test.email',prefix||'-a@example.invalid',true);
  insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at) values
    (a,'authenticated','authenticated',prefix||'-a@example.invalid',now(),now(),now()),
    (b,'authenticated','authenticated',prefix||'-b@example.invalid',now(),now(),now()),
    (c,'authenticated','authenticated',prefix||'-c@example.invalid',now(),now(),now());
  insert into auth.sessions(id,user_id,created_at,updated_at) values
    (fresh,a,now(),now()),(old_session,a,now()-interval '1 hour',now()),(other_session,a,now(),now());
  insert into public.studyflow_settings(user_id,profile,modules,revision) values
    (a,'{"name":"Synthetic departing user"}','[]',10),
    (b,'{"name":"Synthetic recipient"}','[]',20),(c,'{"name":"Synthetic organizer"}','[]',30);
  insert into public.studyflow_groups(id,owner_id,data) values
    (prefix||'-departing',a,jsonb_build_object('kind','group','title','Departing group','memberIds',jsonb_build_array(prefix||'-b@example.invalid'),
      'moduleSnapshot',jsonb_build_object('id','synthetic-module','name','Preserved module','code','SYN','color','#245b87'))),
    (prefix||'-kept',c,jsonb_build_object('kind','group','title','Keep this group','memberIds',jsonb_build_array(prefix||'-a@example.invalid',prefix||'-b@example.invalid')));
  insert into public.studyflow_group_members(group_id,email,display_name) values
    (prefix||'-departing',prefix||'-b@example.invalid','Recipient'),
    (prefix||'-kept',prefix||'-a@example.invalid','Departing'),(prefix||'-kept',prefix||'-b@example.invalid','Recipient');
  insert into public.studyflow_items(id,owner_id,group_id,data) values
    (prefix||'-own',a,null,'{"kind":"task","title":"Own private task","done":false}'),
    (prefix||'-own-shared',a,prefix||'-departing','{"kind":"task","title":"Own shared task","done":false}'),
    (prefix||'-own-other-group',a,prefix||'-kept','{"kind":"task","title":"Own task in another group","done":false}'),
    (prefix||'-preserved',b,prefix||'-departing',jsonb_build_object('kind','task','title','Preserve all this content','description','Do not lose this',
      'done',true,'due','2026-12-03T18:00','reminder','60','priority','High','moduleId','synthetic-module','groupId',prefix||'-departing','workType','group')),
    (prefix||'-other-shared',b,prefix||'-kept','{"kind":"task","title":"Unchanged other group task","workType":"group","done":false}'),
    (prefix||'-other-private',c,null,'{"kind":"task","title":"Unchanged private task","done":false}');
  perform set_config('studyflow_delete_test.preserved_before',(select data::text from public.studyflow_items where id=prefix||'-preserved'),true);
end; $$;
set local role anon;
do $$ begin
  begin
    perform public.studyflow_delete_account(current_setting('studyflow_delete_test.email'),10);
    raise exception 'Anonymous account deletion was accepted';
  exception when insufficient_privilege then null; end;
end; $$;
set local role authenticated;
do $$
declare message text;
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('studyflow_delete_test.a'),'role','authenticated',
    'session_id',current_setting('studyflow_delete_test.old'))::text,true);
  begin
    perform public.studyflow_delete_account(current_setting('studyflow_delete_test.email'),10);
    raise exception 'Old session deletion was accepted';
  exception when insufficient_privilege then
    get stacked diagnostics message=MESSAGE_TEXT;
    if message<>'STUDYFLOW_RECENT_SIGN_IN_REQUIRED' then raise exception 'Unexpected old-session result: %',message; end if;
  end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('studyflow_delete_test.a'),'role','authenticated',
    'session_id',current_setting('studyflow_delete_test.fresh'))::text,true);
  begin
    perform public.studyflow_delete_account(current_setting('studyflow_delete_test.prefix')||'-b@example.invalid',10);
    raise exception 'Another account email was accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.studyflow_delete_account(current_setting('studyflow_delete_test.email'),9);
    raise exception 'Stale account deletion was accepted';
  exception when serialization_failure then null; end;
  if (select count(*) from public.studyflow_items where owner_id=auth.uid())<>3 then raise exception 'Rejected deletion changed account data'; end if;
  if public.studyflow_delete_account('  '||upper(current_setting('studyflow_delete_test.email'))||'  ',10)<>'{"deleted":true}'::jsonb then
    raise exception 'Deletion did not return success';
  end if;
  if exists(select 1 from public.studyflow_items) or exists(select 1 from public.studyflow_groups)
     or exists(select 1 from public.studyflow_settings) then raise exception 'Deleted JWT retained application access'; end if;
  begin
    perform public.studyflow_save(0,'{"profile":{},"modules":[],"theme":"Green","mono":false}','[]','[]');
    raise exception 'Deleted JWT recreated account data';
  exception when foreign_key_violation then null; end;
end; $$;
reset role;
do $$
declare prefix text:=current_setting('studyflow_delete_test.prefix'); preserved jsonb; expected jsonb;
begin
  if exists(select 1 from auth.users where id=current_setting('studyflow_delete_test.a')::uuid)
     or exists(select 1 from auth.sessions where user_id=current_setting('studyflow_delete_test.a')::uuid) then raise exception 'Account or sessions remain'; end if;
  if (select count(*) from auth.users where id in (current_setting('studyflow_delete_test.b')::uuid,current_setting('studyflow_delete_test.c')::uuid))<>2 then
    raise exception 'Another account was removed'; end if;
  if exists(select 1 from public.studyflow_groups where id=prefix||'-departing') then raise exception 'Owned group remains'; end if;
  if exists(select 1 from public.studyflow_group_members where email=current_setting('studyflow_delete_test.email')) then raise exception 'Membership remains'; end if;
  if (select data->'memberIds' from public.studyflow_groups where id=prefix||'-kept')<>jsonb_build_array(prefix||'-b@example.invalid') then raise exception 'Other group members were changed incorrectly'; end if;
  if (select group_id from public.studyflow_items where id=prefix||'-preserved') is not null then raise exception 'Task was not detached'; end if;
  select data into preserved from public.studyflow_items where id=prefix||'-preserved';
  expected:=current_setting('studyflow_delete_test.preserved_before')::jsonb||jsonb_build_object('groupId','','workType','individual',
    'moduleSnapshot',jsonb_build_object('id','synthetic-module','name','Preserved module','code','SYN','color','#245b87'));
  if preserved is distinct from expected then raise exception 'Preserved task content changed'; end if;
  if (select revision from public.studyflow_settings where user_id=current_setting('studyflow_delete_test.b')::uuid)<>21
    or (select revision from public.studyflow_settings where user_id=current_setting('studyflow_delete_test.c')::uuid)<>31 then
    raise exception 'Affected account revisions were not advanced once'; end if;
  if (select data from public.studyflow_items where id=prefix||'-other-shared')<>'{"kind":"task","title":"Unchanged other group task","workType":"group","done":false}'::jsonb
    or (select data from public.studyflow_items where id=prefix||'-other-private')<>'{"kind":"task","title":"Unchanged private task","done":false}'::jsonb then
    raise exception 'Unrelated tasks changed'; end if;
end; $$;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('studyflow_delete_test.b'),'role','authenticated')::text,true);
  if not exists(select 1 from public.studyflow_items where id=current_setting('studyflow_delete_test.prefix')||'-preserved' and group_id is null) then
    raise exception 'Recipient cannot read the preserved task'; end if;
  begin
    perform public.studyflow_save(20,'{"profile":{},"modules":[],"theme":"Green","mono":false}','[]','[]');
    raise exception 'Stale save restored old data';
  exception when serialization_failure then null; end;
end; $$;
reset role;
rollback;
select 'PASS' as self_deletion_checks, true as synthetic_fixtures_rolled_back;
