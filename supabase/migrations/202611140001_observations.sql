create table public.observations (
  id uuid primary key,
  author_id uuid not null default auth.uid() references auth.users(id),
  resident_id text not null check (resident_id in ('resident-1', 'resident-2', 'resident-3')),
  meal text not null check (meal in ('전량', '절반 이상', '절반 미만', '드시지 않음', '미확인')),
  water text not null check (water in ('평소보다 많음', '평소와 비슷함', '평소보다 적음', '미확인')),
  bowel text not null check (bowel in ('보통 변', '묽은 변', '단단한 변', '배변 없음', '미확인')),
  walking text not null check (walking in ('혼자 걸음', '보조기 사용', '부축 필요', '걷지 않음', '미확인')),
  created_at timestamptz not null default now()
);
alter table public.observations enable row level security;
revoke all on public.observations from anon, authenticated;
grant select, insert on public.observations to authenticated;
create policy "Read own observations" on public.observations for select to authenticated using ((select auth.uid()) = author_id);
create policy "Insert own observations" on public.observations for insert to authenticated with check ((select auth.uid()) = author_id);
create index observations_author_created on public.observations(author_id, created_at desc);
