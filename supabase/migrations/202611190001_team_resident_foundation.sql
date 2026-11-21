begin;

-- Additive foundation: anonymous observation storage stays unchanged until #18.
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);

create table public.team_memberships (
  team_id uuid not null references public.teams(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('admin', 'caregiver')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_memberships_user on public.team_memberships(user_id);

create table public.residents (
  id text primary key check (length(btrim(id)) between 1 and 100),
  team_id uuid not null references public.teams(id),
  name text not null check (length(btrim(name)) between 1 and 100),
  room text not null check (length(btrim(room)) between 1 and 100),
  created_at timestamptz not null default now()
);
create index residents_team on public.residents(team_id);

alter table public.teams enable row level security;
alter table public.team_memberships enable row level security;
alter table public.residents enable row level security;
revoke all on public.teams, public.team_memberships, public.residents from anon, authenticated;
grant select on public.teams, public.team_memberships, public.residents to authenticated;
grant all on public.teams, public.team_memberships, public.residents to service_role;

-- Clients cannot assign membership or elevate their own role.
create policy "Read own permanent memberships" on public.team_memberships
  for select to authenticated using (
    user_id = (select auth.uid())
    and (select auth.jwt() ->> 'is_anonymous') = 'false'
  );
create policy "Read member teams" on public.teams
  for select to authenticated using (
    id in (select team_id from public.team_memberships)
  );
create policy "Read team residents" on public.residents
  for select to authenticated using (
    team_id in (select team_id from public.team_memberships)
  );

comment on table public.team_memberships is
  'Provisioned by trusted administration only. Family access requires a separate resident-scoped design; never grant family a team-wide role.';
comment on table public.residents is
  'Team-scoped resident directory. Legacy text IDs are preserved. Observations remain author-scoped until the reviewed #18 cutover.';

commit;
