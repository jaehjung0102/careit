-- Disposable development DB after all migrations and seed.sql. Fixtures roll back.
begin;
insert into auth.users(id, is_anonymous) values
  ('19000000-0000-4000-8000-000000000001', false),
  ('19000000-0000-4000-8000-000000000002', false),
  ('19000000-0000-4000-8000-000000000003', false),
  ('19000000-0000-4000-8000-000000000004', false),
  ('19000000-0000-4000-8000-000000000005', true);
insert into public.teams(id, name) values ('19000000-0000-4000-8000-000000000099', '다른 가상팀');
insert into public.team_memberships(team_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000017', '19000000-0000-4000-8000-000000000001', 'caregiver'),
  ('00000000-0000-4000-8000-000000000017', '19000000-0000-4000-8000-000000000002', 'admin'),
  ('00000000-0000-4000-8000-000000000017', '19000000-0000-4000-8000-000000000003', 'caregiver'),
  ('19000000-0000-4000-8000-000000000099', '19000000-0000-4000-8000-000000000004', 'admin'),
  ('00000000-0000-4000-8000-000000000017', '19000000-0000-4000-8000-000000000005', 'caregiver');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"19000000-0000-4000-8000-000000000001","is_anonymous":false}',true);
do $$ declare input jsonb; row public.observations; original_created timestamptz; begin
  input := '{"id":"19000000-0000-4000-8000-000000000020","team_id":"00000000-0000-4000-8000-000000000017","resident_id":"resident-1","meal":"전량","water":"충분","bowel":"보통 변","walking":"스스로 이동"}';
  row := public.create_observation(input);
  original_created := row.created_at;
  assert row.version = 1 and row.updated_by = auth.uid() and row.updated_at is not null;
  row := public.create_observation(input);
  assert row.version = 1;
  assert (select count(*) = 1 from public.observation_revisions where observation_id = row.id);
  begin
    perform public.create_observation(input || '{"meal":"절반"}');
    raise exception 'Different create payload accepted';
  exception when sqlstate 'PT409' then assert sqlerrm = 'IDEMPOTENCY_CONFLICT'; end;
  row := public.update_observation(row.id, '19000000-0000-4000-8000-000000000030', 1, '{"meal":"절반"}');
  assert row.version = 2 and row.meal = '절반' and row.created_at = original_created;
  assert row.author_id = auth.uid() and row.updated_by = auth.uid();
  row := public.update_observation(row.id, '19000000-0000-4000-8000-000000000030', 1, '{"meal":"절반"}');
  assert row.version = 2;
  row := public.update_observation(row.id, '19000000-0000-4000-8000-000000000031', 2, '{"water":"보통"}');
  assert row.version = 3;
  row := public.update_observation(row.id, '19000000-0000-4000-8000-000000000030', 1, '{"meal":"절반"}');
  assert row.version = 3;
  row := public.create_observation(input);
  assert row.version = 3, 'Create replay must survive later edits';
  assert (select count(*) = 3 from public.observation_revisions where observation_id = row.id);
  assert (select snapshot->>'meal' = '전량' from public.observation_revisions where observation_id = row.id and version = 1);
  assert (select snapshot->>'meal' = '절반' from public.observation_revisions where observation_id = row.id and version = 2);
  begin
    perform public.update_observation(row.id, '19000000-0000-4000-8000-000000000030', 1, '{"meal":"전량"}');
    raise exception 'Changed replay accepted';
  exception when sqlstate 'PT409' then assert sqlerrm = 'IDEMPOTENCY_CONFLICT'; end;
  begin
    perform public.update_observation(row.id, '19000000-0000-4000-8000-000000000032', 1, '{"meal":"전량"}');
    raise exception 'Stale version accepted';
  exception when sqlstate 'PT409' then assert sqlerrm = 'VERSION_CONFLICT'; end;
  begin
    perform public.update_observation(row.id, gen_random_uuid(), 3, '{"author_id":"19000000-0000-4000-8000-000000000002"}');
    raise exception 'Immutable field changed';
  exception when sqlstate 'PT422' then null; end;
  begin
    perform public.update_observation(row.id, gen_random_uuid(), 3, '{"meal":null}');
    raise exception 'Invalid row accepted';
  exception when sqlstate 'PT422' then null; end;
  begin
    perform public.update_observation(row.id, gen_random_uuid(), 3, '{"meal":123}');
    raise exception 'Non-string accepted';
  exception when sqlstate 'PT422' then null; end;
  assert (select version = 3 from public.observations where id = row.id);
  assert (select count(*) = 3 from public.observation_revisions where observation_id = row.id), 'Failed mutations left history';
  perform public.create_observation('{"id":"19000000-0000-4000-8000-000000000021","resident_id":"resident-1","meal":"전량","water":"충분","bowel":"보통 변","walking":"스스로 이동"}');
  begin
    update public.observations set meal = '절반' where id = row.id;
    raise exception 'Direct update allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.observation_revisions where observation_id = row.id;
    raise exception 'History deletion allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.observation_revisions(observation_id, version, action, snapshot)
      values (row.id, 99, 'update', '{}');
    raise exception 'History forged';
  exception when insufficient_privilege then null; end;
end $$;

-- Old direct INSERT remains compatible, but caller metadata is not trusted.
insert into public.observations(id, resident_id, meal, water, bowel, walking, version, created_at, updated_by)
values ('19000000-0000-4000-8000-000000000022', 'resident-1', '전량', '충분', '보통 변', '스스로 이동', 99,
  '2000-01-01T00:00:00Z', '19000000-0000-4000-8000-000000000002');
do $$ begin
  assert (select version = 1 and updated_by = auth.uid() and created_at > '2020-01-01T00:00:00Z'
    from public.observations where id = '19000000-0000-4000-8000-000000000022');
end $$;

select set_config('request.jwt.claims','{"sub":"19000000-0000-4000-8000-000000000003","is_anonymous":false}',true);
do $$ begin
  assert (select count(*) = 3 from public.observation_revisions where observation_id = '19000000-0000-4000-8000-000000000020');
  begin
    perform public.update_observation('19000000-0000-4000-8000-000000000020', gen_random_uuid(), 3, '{"meal":"전량"}');
    raise exception 'Peer edited someone else record';
  exception when sqlstate 'PT403' then null; end;
end $$;

select set_config('request.jwt.claims','{"sub":"19000000-0000-4000-8000-000000000002","is_anonymous":false}',true);
do $$ declare row public.observations; begin
  row := public.update_observation('19000000-0000-4000-8000-000000000020', gen_random_uuid(), 3, '{"meal":"전량"}');
  assert row.version = 4 and row.updated_by = auth.uid() and row.author_id = '19000000-0000-4000-8000-000000000001';
  begin
    perform public.update_observation('19000000-0000-4000-8000-000000000021', gen_random_uuid(), 1, '{"meal":"절반"}');
    raise exception 'Admin edited private record';
  exception when sqlstate 'PT404' then null; end;
end $$;

select set_config('request.jwt.claims','{"sub":"19000000-0000-4000-8000-000000000004","is_anonymous":false}',true);
do $$ begin
  assert not exists (select 1 from public.observation_revisions where observation_id = '19000000-0000-4000-8000-000000000020');
  begin
    perform public.update_observation('19000000-0000-4000-8000-000000000020', gen_random_uuid(), 4, '{"meal":"절반"}');
    raise exception 'Other team edited record';
  exception when sqlstate 'PT404' then null; end;
end $$;

select set_config('request.jwt.claims','{"sub":"19000000-0000-4000-8000-000000000005","is_anonymous":true}',true);
do $$ declare row public.observations; begin
  row := public.create_observation('{"id":"19000000-0000-4000-8000-000000000023","resident_id":"resident-2","meal":"전량","water":"충분","bowel":"보통 변","walking":"스스로 이동"}');
  row := public.update_observation(row.id, gen_random_uuid(), 1, '{"meal":"절반"}');
  assert row.version = 2;
  begin
    perform public.create_observation('{"id":"19000000-0000-4000-8000-000000000024","team_id":"00000000-0000-4000-8000-000000000017","resident_id":"resident-1","meal":"전량","water":"충분","bowel":"보통 변","walking":"스스로 이동"}');
    raise exception 'Anonymous membership used';
  exception when sqlstate 'PT403' then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"19000000-0000-4000-8000-000000000005"}',true);
do $$ begin
  begin
    perform public.create_observation('{"id":"19000000-0000-4000-8000-000000000024","team_id":"00000000-0000-4000-8000-000000000017","resident_id":"resident-1","meal":"전량","water":"충분","bowel":"보통 변","walking":"스스로 이동"}');
    raise exception 'Missing anonymous claim bypassed authorization';
  exception when sqlstate 'PT403' then null; end;
end $$;

reset role;
delete from public.team_memberships where user_id = '19000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"19000000-0000-4000-8000-000000000001","is_anonymous":false}',true);
do $$ begin
  assert not exists (select 1 from public.observation_revisions where observation_id = '19000000-0000-4000-8000-000000000020');
  begin
    perform public.update_observation('19000000-0000-4000-8000-000000000020', gen_random_uuid(), 4, '{"meal":"절반"}');
    raise exception 'Revoked member edited own team row';
  exception when sqlstate 'PT404' then null; end;
end $$;
reset role;
rollback;
