begin;

-- Existing anonymous rows stay private; never infer a team from a legacy resident ID.
alter table public.observations add column team_id uuid;
alter table public.residents add constraint residents_team_id_id_key unique (team_id, id);
alter table public.observations drop constraint observations_resident_id_check;
alter table public.observations add constraint observations_team_resident_fk
  foreign key (team_id, resident_id) references public.residents(team_id, id);
create index observations_team_created on public.observations(team_id, created_at desc)
  where team_id is not null;

drop policy "Read own observations" on public.observations;
drop policy "Insert own observations" on public.observations;
create policy "Read private or member team observations" on public.observations
  for select to authenticated using (
    (team_id is null and author_id = (select auth.uid()))
    or team_id in (select team_id from public.team_memberships)
  );
create policy "Insert private or member team observations" on public.observations
  for insert to authenticated with check (
    author_id = (select auth.uid()) and (
      (team_id is null and resident_id in ('resident-1', 'resident-2', 'resident-3'))
      or team_id in (select team_id from public.team_memberships)
    )
  );

comment on column public.observations.team_id is
  'NULL: legacy private demo row. Non-NULL: permanent team members can read; author-only insert plus team/resident FK. No UPDATE/DELETE grants.';

commit;
