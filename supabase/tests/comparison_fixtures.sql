-- psql -X -v ON_ERROR_STOP=1 -v fixture_json="$(cat supabase/tests/fixtures/comparison.json)" ... -f this-file
-- Disposable development DB only, after migrations + seed.sql. Every change rolls back.
\set ON_ERROR_STOP on
begin;
set local plpgsql.check_asserts = on;
create temporary table comparison_fixture (data jsonb not null);
insert into comparison_fixture values (:'fixture_json'::jsonb);
create temporary table fixture_actors as
  select key as label, value as actor from comparison_fixture, jsonb_each(data->'actors');
create temporary table fixture_records as
  select value as item from comparison_fixture, jsonb_array_elements(data->'records');
grant select on comparison_fixture, fixture_actors, fixture_records to authenticated;

insert into auth.users(id, is_anonymous)
  select (actor->>'id')::uuid, (actor->>'is_anonymous')::boolean from fixture_actors;
insert into public.teams(id, name)
  select (value->>'id')::uuid, value->>'name'
  from comparison_fixture, jsonb_array_elements(data->'teams');
insert into public.residents(id, team_id, name, room)
  select value->>'id', (value->>'team_id')::uuid, value->>'name', value->>'room'
  from comparison_fixture, jsonb_array_elements(data->'residents');
insert into public.team_memberships(team_id, user_id, role)
  select (actor->>'team_id')::uuid, (actor->>'id')::uuid, actor->>'role'
  from fixture_actors where actor->>'team_id' is not null;

-- Store only fields actually supported by the DB; comparison metadata stays temporary.
set local role authenticated;
do $$ declare row jsonb; identity jsonb; payload jsonb; begin
  for row in select item from fixture_records loop
    select actor into strict identity from fixture_actors where label = row->>'author';
    perform set_config('request.jwt.claims', jsonb_build_object(
      'sub', identity->>'id', 'is_anonymous', identity->'is_anonymous')::text, true);
    payload := (row->'record'->'fields') || jsonb_build_object(
      'id', row->'record'->>'id', 'resident_id', row->'record'->>'resident_id',
      'team_id', row->'team_id', 'water', '미확인');
    perform public.create_observation(payload);
  end loop;
end $$;

-- Check real RLS against the entire shared fixture, not a mock authorization callback.
do $$ declare identity jsonb; expected uuid[]; actual uuid[]; begin
  for identity in select actor from fixture_actors loop
    perform set_config('request.jwt.claims', jsonb_build_object(
      'sub', identity->>'id', 'is_anonymous', identity->'is_anonymous')::text, true);
    select coalesce(array_agg((r.item->'record'->>'id')::uuid order by r.item->'record'->>'id'), '{}')
      into expected from fixture_records r join fixture_actors a on a.label = r.item->>'author'
      where (r.item->>'team_id' is null and a.actor->>'id' = identity->>'id')
        or (not (identity->>'is_anonymous')::boolean
          and r.item->>'team_id' = identity->>'team_id');
    select coalesce(array_agg(o.id order by o.id), '{}') into actual
      from public.observations o join fixture_records r on o.id = (r.item->'record'->>'id')::uuid;
    assert actual = expected, 'Observation RLS mismatch for ' || (identity->>'id');
    select coalesce(array_agg(h.observation_id order by h.observation_id), '{}') into actual
      from public.observation_revisions h join fixture_records r on h.observation_id = (r.item->'record'->>'id')::uuid;
    assert actual = expected, 'Revision RLS mismatch for ' || (identity->>'id');
  end loop;
end $$;

-- All comparison history IDs must be real stored rows for this resident, once per logical ID.
select set_config('request.jwt.claims', jsonb_build_object('sub', actor->>'id', 'is_anonymous', false)::text, true)
  from fixture_actors where label = 'author';
do $$ declare f jsonb; current_id uuid; begin
  select data into strict f from comparison_fixture;
  current_id := (f->>'current_id')::uuid;
  assert (select count(*) = 15 from fixture_records);
  assert (select count(*) = 10 from public.observations o join fixture_records r
    on o.id = (r.item->'record'->>'id')::uuid
    where o.resident_id = (select resident_id from public.observations where id = current_id)
      and o.team_id is not null), 'History must not mix residents or private rows';
  assert not exists (
    select 1 from fixture_records r join public.observations o on o.id = (r.item->'record'->>'id')::uuid
    where o.meal is distinct from r.item->'record'->'fields'->>'meal'
      or o.meal_period is distinct from r.item->'record'->'fields'->>'meal_period'
  ), 'Stored categories drifted from calculation fixture';
  perform public.update_observation(current_id, '20000000-0000-4000-8000-000000000400', 1, '{"meal":"3/4"}');
  assert (select count(*) = 1 from public.observations where id = current_id), 'Versions counted as separate observations';
  assert (select count(*) = 2 from public.observation_revisions where observation_id = current_id);
  assert (select meal = '3/4' and version = 2 from public.observations where id = current_id);
  begin
    insert into public.observations(id, author_id, resident_id, meal, water, bowel, walking)
      values ('20000000-0000-4000-8000-000000000401', '20000000-0000-4000-8000-000000000303',
        'resident-1', '전량', '미확인', '미확인', '부축 필요');
    raise exception 'Forged author accepted';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claims', jsonb_build_object('sub', actor->>'id', 'is_anonymous', false)::text, true)
  from fixture_actors where label = 'peer';
do $$ begin
  begin
    perform public.update_observation('20000000-0000-4000-8000-000000000006',
      '20000000-0000-4000-8000-000000000402', 2, '{"meal":"전량"}');
    raise exception 'Peer edited another author';
  exception when sqlstate 'PT403' then null; end;
end $$;

-- A missing anonymous claim must not unlock shared rows (even with membership).
select set_config('request.jwt.claims', jsonb_build_object('sub', actor->>'id')::text, true)
  from fixture_actors where label = 'anonymous';
do $$ begin
  assert not exists (select 1 from public.observations where team_id = '20000000-0000-4000-8000-000000000100');
end $$;

reset role;
delete from public.team_memberships where user_id = '20000000-0000-4000-8000-000000000301';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000301","is_anonymous":false}', true);
do $$ begin
  assert not exists (select 1 from public.observations where team_id = '20000000-0000-4000-8000-000000000100'), 'Revoked author reads shared history';
  assert not exists (select 1 from public.observation_revisions where observation_id = '20000000-0000-4000-8000-000000000006'), 'Revoked author reads revisions';
  assert exists (select 1 from public.observations where id = '20000000-0000-4000-8000-000000000012'), 'Revocation deleted private data';
  begin
    perform public.update_observation('20000000-0000-4000-8000-000000000006',
      '20000000-0000-4000-8000-000000000403', 2, '{"meal":"전량"}');
    raise exception 'Revoked author edited shared row';
  exception when sqlstate 'PT404' then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform 1 from public.observations;
    raise exception 'Unauthenticated read allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
\echo '#20 fixture/RLS/revision checks passed; all fixture changes rolled back.'
