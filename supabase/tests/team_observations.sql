-- Disposable development database only. Run after all migrations and seed.sql.
begin;
insert into auth.users(id, is_anonymous) values
  ('18000000-0000-4000-8000-000000000001', false),
  ('18000000-0000-4000-8000-000000000002', false),
  ('18000000-0000-4000-8000-000000000003', false),
  ('18000000-0000-4000-8000-000000000004', false),
  ('18000000-0000-4000-8000-000000000005', false),
  ('18000000-0000-4000-8000-000000000006', false),
  ('18000000-0000-4000-8000-000000000007', true);
insert into public.teams(id, name) values ('18000000-0000-4000-8000-000000000099', '다른 가상팀');
insert into public.residents(id, team_id, name, room) values
  ('18000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000017', '가상 신규 어르신', '101호'),
  ('18000000-0000-4000-8000-000000000011', '18000000-0000-4000-8000-000000000099', '다른 팀 가상 어르신', '102호');
insert into public.team_memberships(team_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000017', '18000000-0000-4000-8000-000000000001', 'admin'),
  ('00000000-0000-4000-8000-000000000017', '18000000-0000-4000-8000-000000000002', 'caregiver'),
  ('00000000-0000-4000-8000-000000000017', '18000000-0000-4000-8000-000000000003', 'caregiver'),
  ('00000000-0000-4000-8000-000000000017', '18000000-0000-4000-8000-000000000004', 'caregiver'),
  ('18000000-0000-4000-8000-000000000099', '18000000-0000-4000-8000-000000000005', 'admin'),
  ('00000000-0000-4000-8000-000000000017', '18000000-0000-4000-8000-000000000007', 'caregiver');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"18000000-0000-4000-8000-000000000001","is_anonymous":false}',true);
insert into public.observations(id, team_id, resident_id, meal, water, bowel, walking) values
  ('18000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000017', '18000000-0000-4000-8000-000000000010', '전량', '충분', '보통 변', '스스로 이동');
-- A private legacy row must never become visible to other team members.
insert into public.observations(id, resident_id, meal, water, bowel, walking) values
  ('18000000-0000-4000-8000-000000000021', 'resident-1', '전량', '충분', '보통 변', '스스로 이동');
select set_config('request.jwt.claims','{"sub":"18000000-0000-4000-8000-000000000003","is_anonymous":false}',true);
insert into public.observations(id, team_id, resident_id, meal, water, bowel, walking) values
  ('18000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000017', '18000000-0000-4000-8000-000000000010', '절반', '보통', '보통 변', '스스로 이동');

do $$ declare uid uuid; begin
  foreach uid in array array[
    '18000000-0000-4000-8000-000000000001'::uuid,
    '18000000-0000-4000-8000-000000000002'::uuid,
    '18000000-0000-4000-8000-000000000003'::uuid,
    '18000000-0000-4000-8000-000000000004'::uuid
  ] loop
    perform set_config('request.jwt.claims',json_build_object('sub',uid,'is_anonymous',false)::text,true);
    assert (select count(*) = 2 from public.observations where id in ('18000000-0000-4000-8000-000000000020', '18000000-0000-4000-8000-000000000022')), 'All four demo identities must read shared rows';
    assert (select count(*) = 4 from public.residents), 'Only own team directory';
    if uid <> '18000000-0000-4000-8000-000000000001'::uuid then
      assert not exists (select 1 from public.observations where id = '18000000-0000-4000-8000-000000000021'), 'Legacy row leaked to team';
    end if;
  end loop;
  begin
    insert into public.observations(id, team_id, resident_id, meal, water, bowel, walking) values
      (gen_random_uuid(), '00000000-0000-4000-8000-000000000017', '18000000-0000-4000-8000-000000000011', '전량', '충분', '보통 변', '스스로 이동');
    raise exception 'Cross-team resident accepted';
  exception when foreign_key_violation then null; end;
  begin
    update public.observations set meal = '절반' where id = '18000000-0000-4000-8000-000000000020';
    raise exception 'Unexpected edit privilege';
  exception when insufficient_privilege then null; end;
end $$;

-- Other team, no membership, and mistakenly enrolled anonymous users are denied.
do $$ declare uid uuid; begin
  foreach uid in array array[
    '18000000-0000-4000-8000-000000000005'::uuid,
    '18000000-0000-4000-8000-000000000006'::uuid,
    '18000000-0000-4000-8000-000000000007'::uuid
  ] loop
    perform set_config('request.jwt.claims',json_build_object('sub',uid,'is_anonymous',uid = '18000000-0000-4000-8000-000000000007'::uuid)::text,true);
    assert not exists (select 1 from public.observations where team_id = '00000000-0000-4000-8000-000000000017'), 'Unauthorized team read';
    begin
      insert into public.observations(id, team_id, resident_id, meal, water, bowel, walking) values
        (gen_random_uuid(), '00000000-0000-4000-8000-000000000017', '18000000-0000-4000-8000-000000000010', '전량', '충분', '보통 변', '스스로 이동');
      raise exception 'Unauthorized team write';
    exception when insufficient_privilege then null; end;
  end loop;
end $$;

-- Revocation removes access even to the user's own shared rows.
reset role;
delete from public.team_memberships where user_id = '18000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"18000000-0000-4000-8000-000000000003","is_anonymous":false}',true);
do $$ begin
  assert not exists (select 1 from public.observations where id = '18000000-0000-4000-8000-000000000022'), 'Author bypasses revoked membership';
end $$;
reset role;
rollback;
