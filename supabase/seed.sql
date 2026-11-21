-- Development only: fictional residents matching the current mock directory.
-- No auth accounts or memberships are created, and no observations are changed.
begin;
insert into public.teams (id, name) values
  ('00000000-0000-4000-8000-000000000017', '가상 돌봄잇 개발팀')
on conflict (id) do nothing;
insert into public.residents (id, team_id, name, room) values
  ('resident-1', '00000000-0000-4000-8000-000000000017', '김영희', '201호'),
  ('resident-2', '00000000-0000-4000-8000-000000000017', '박철수', '203호'),
  ('resident-3', '00000000-0000-4000-8000-000000000017', '이순자', '205호')
on conflict (id) do nothing;
commit;
