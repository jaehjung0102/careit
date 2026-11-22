-- Run on a disposable database after all migrations and supabase/seed.sql.
-- All test users, memberships and records are rolled back.
begin;
insert into auth.users (id, is_anonymous) values
  ('10000000-0000-4000-8000-000000000001', false),
  ('10000000-0000-4000-8000-000000000002', false),
  ('10000000-0000-4000-8000-000000000003', true);
insert into public.teams (id, name) values
  ('00000000-0000-4000-8000-000000000099', '다른 가상팀');
insert into public.residents (id, team_id, name, room) values
  ('other-resident', '00000000-0000-4000-8000-000000000099', '가상 어르신', '999호');
insert into public.team_memberships (team_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000017', '10000000-0000-4000-8000-000000000001', 'caregiver'),
  ('00000000-0000-4000-8000-000000000099', '10000000-0000-4000-8000-000000000002', 'admin'),
  ('00000000-0000-4000-8000-000000000017', '10000000-0000-4000-8000-000000000003', 'caregiver');

-- Authentication does not itself grant team access.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","is_anonymous":false}', true);
do $$ begin
  assert (select count(*) = 1 from public.teams), 'Must see only own team';
  assert (select count(*) = 1 from public.team_memberships), 'Must see only own membership';
  assert (select count(*) = 3 from public.residents), 'Must see only own residents';
  assert not exists (select 1 from public.residents where id = 'other-resident'), 'Cross-team leak';
  begin
    insert into public.team_memberships (team_id, user_id, role) values
      ('00000000-0000-4000-8000-000000000099', '10000000-0000-4000-8000-000000000001', 'admin');
    raise exception 'Self-enrollment unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.team_memberships set role = 'admin';
    raise exception 'Role escalation unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.residents (id, team_id, name, room) values
      ('client-created', '00000000-0000-4000-8000-000000000017', '가상', '1호');
    raise exception 'Client resident creation unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002","is_anonymous":false}', true);
do $$ begin
  assert (select count(*) = 1 from public.residents), 'Other team must see its resident only';
  assert (select count(*) = 1 from public.teams), 'Other team must see its team only';
end $$;

-- Even an accidentally provisioned anonymous member cannot read the directory.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","is_anonymous":true}', true);
do $$ begin
  assert not exists (select 1 from public.residents), 'Anonymous directory leak';
  assert not exists (select 1 from public.teams), 'Anonymous team leak';
  assert not exists (select 1 from public.team_memberships), 'Anonymous membership leak';
end $$;
-- Existing anonymous save/reload and author isolation still work.
insert into public.observations (id, resident_id, meal, water, bowel, walking) values
  ('20000000-0000-4000-8000-000000000001', 'resident-1', '전량', '충분', '보통 변', '스스로 이동');
do $$ begin
  assert (select count(*) = 1 from public.observations where id = '20000000-0000-4000-8000-000000000001'), 'Legacy save/reload failed';
  begin
    insert into public.observations (id, author_id, resident_id, meal, water, bowel, walking) values
      ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'resident-1', '전량', '충분', '보통 변', '스스로 이동');
    raise exception 'Author spoofing unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","is_anonymous":false}', true);
do $$ begin
  assert not exists (select 1 from public.observations where id = '20000000-0000-4000-8000-000000000001'), 'Observation author isolation failed';
end $$;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000004","is_anonymous":false}', true);
do $$ begin
  assert not exists (select 1 from public.residents), 'Nonmember directory leak';
  assert not exists (select 1 from public.teams), 'Nonmember team leak';
end $$;
set local role anon;
do $$ begin
  begin
    perform * from public.residents;
    raise exception 'Unauthenticated read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
