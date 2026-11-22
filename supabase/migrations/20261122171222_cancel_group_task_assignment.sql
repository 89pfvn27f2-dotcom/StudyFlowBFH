-- Cancel the unpublished task-assignment feature; existing group data and row policies remain unchanged.
-- Remove the exposed wrapper first, then the narrowly scoped implementation. No CASCADE.
drop function if exists public.studyflow_complete_task(text,boolean,boolean,bigint);
drop function if exists studyflow_private.complete_task(text,boolean,boolean,bigint);
notify pgrst,'reload schema';
