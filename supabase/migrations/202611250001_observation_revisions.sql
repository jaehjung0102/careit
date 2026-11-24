begin;

alter table public.observations
  add column version integer not null default 1 check (version > 0),
  add column updated_at timestamptz,
  add column updated_by uuid references auth.users(id);

create table public.observation_revisions (
  observation_id uuid not null references public.observations(id),
  version integer not null check (version > 0),
  action text not null check (action in ('baseline', 'create', 'update')),
  actor_id uuid references auth.users(id),
  recorded_at timestamptz not null default clock_timestamp(),
  request_id uuid,
  request_payload jsonb,
  snapshot jsonb not null,
  primary key (observation_id, version),
  unique (actor_id, request_id)
);
alter table public.observation_revisions enable row level security;
revoke all on public.observation_revisions from public, anon, authenticated;
grant select on public.observation_revisions to authenticated;
revoke update, delete on public.observations from public, anon, authenticated;
create policy "Read revisions of visible observations" on public.observation_revisions
  for select to authenticated using (
    exists (select 1 from public.observations o where o.id = observation_revisions.observation_id)
  );

-- This is a migration snapshot, not a reconstructed past edit or creator request.
insert into public.observation_revisions(observation_id, version, action, snapshot)
  select id, version, 'baseline', to_jsonb(o) from public.observations o;

create function public.observation_request_payload(p_row public.observations)
returns jsonb language sql immutable set search_path = '' as $$
  select to_jsonb(p_row) - array['author_id','created_at','version','updated_at','updated_by'];
$$;

create function public.can_mutate_observation(p_row public.observations, p_edit boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(auth.uid() is not null and case when p_row.team_id is null
    then p_row.author_id = auth.uid()
    else (auth.jwt()->>'is_anonymous') = 'false' and exists (
      select 1 from public.team_memberships m
      where m.team_id = p_row.team_id and m.user_id = auth.uid()
        and (not p_edit or p_row.author_id = auth.uid() or m.role = 'admin')
    ) end, false);
$$;

create function public.stamp_new_observation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and new.author_id is distinct from auth.uid() then
    raise insufficient_privilege using message = 'FORBIDDEN';
  end if;
  new.version := 1;
  new.created_at := clock_timestamp();
  new.updated_at := new.created_at;
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger stamp_new_observation before insert on public.observations
  for each row execute function public.stamp_new_observation();

create function public.audit_new_observation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.observation_revisions
    (observation_id, version, action, actor_id, request_id, request_payload, snapshot)
  values (new.id, 1, 'create', auth.uid(), case when auth.uid() is not null then new.id end,
    public.observation_request_payload(new), to_jsonb(new));
  return new;
end $$;
create trigger audit_new_observation after insert on public.observations
  for each row execute function public.audit_new_observation();

create function public.create_observation(p_input jsonb)
returns public.observations language plpgsql security definer set search_path = '' as $$
declare
  candidate public.observations;
  saved public.observations;
  previous_request public.observation_revisions;
begin
  if auth.uid() is null then raise sqlstate 'PT401' using message = 'UNAUTHENTICATED'; end if;
  if jsonb_typeof(p_input) is distinct from 'object' or p_input - array[
    'id','team_id','resident_id','meal_period','meal','water','bowel','walking','urination',
    'pain','skin','sleep','mood','cognition','communication','hygiene','oral_care',
    'medication','activity','emotional_support'] <> '{}'::jsonb then
    raise sqlstate 'PT422' using message = 'VALIDATION_ERROR';
  end if;
  if exists (select 1 from jsonb_each(p_input) where jsonb_typeof(value) not in ('string','null')) then
    raise sqlstate 'PT422' using message = 'VALIDATION_ERROR';
  end if;
  candidate := jsonb_populate_record(null::public.observations, p_input);
  candidate.author_id := auth.uid();
  if candidate.id is null or candidate.resident_id is null then
    raise sqlstate 'PT422' using message = 'VALIDATION_ERROR';
  end if;
  if not public.can_mutate_observation(candidate, true) or
    (candidate.team_id is null and candidate.resident_id not in ('resident-1','resident-2','resident-3')) then
    raise sqlstate 'PT403' using message = 'FORBIDDEN';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || candidate.id::text, 0));
  insert into public.observations select (candidate).* on conflict (id) do nothing returning * into saved;
  if found then return saved; end if;

  select * into saved from public.observations where id = candidate.id for update;
  if not found or not public.can_mutate_observation(saved, false) then
    raise sqlstate 'PT404' using message = 'NOT_FOUND';
  end if;
  select * into previous_request from public.observation_revisions
    where actor_id = auth.uid() and request_id = candidate.id;
  if found and previous_request.observation_id = saved.id and previous_request.action = 'create'
    and previous_request.request_payload = public.observation_request_payload(candidate) then
    return saved;
  end if;
  raise sqlstate 'PT409' using message = 'IDEMPOTENCY_CONFLICT';
exception
  when unique_violation then raise sqlstate 'PT409' using message = 'IDEMPOTENCY_CONFLICT';
  when check_violation or not_null_violation or invalid_text_representation or foreign_key_violation then
    raise sqlstate 'PT422' using message = 'VALIDATION_ERROR';
end $$;

create function public.update_observation(p_id uuid, p_request_id uuid, p_expected_version integer, p_changes jsonb)
returns public.observations language plpgsql security definer set search_path = '' as $$
declare
  current_row public.observations;
  edited public.observations;
  previous_request public.observation_revisions;
  payload jsonb;
begin
  if auth.uid() is null then raise sqlstate 'PT401' using message = 'UNAUTHENTICATED'; end if;
  if p_id is null or p_request_id is null or p_expected_version is null or p_expected_version < 1
    or jsonb_typeof(p_changes) is distinct from 'object' or p_changes = '{}'::jsonb
    or p_changes - array['meal_period','meal','water','bowel','walking','urination','pain','skin',
      'sleep','mood','cognition','communication','hygiene','oral_care','medication','activity','emotional_support'] <> '{}'::jsonb then
    raise sqlstate 'PT422' using message = 'VALIDATION_ERROR';
  end if;
  if exists (select 1 from jsonb_each(p_changes) where jsonb_typeof(value) not in ('string','null')) then
    raise sqlstate 'PT422' using message = 'VALIDATION_ERROR';
  end if;
  payload := jsonb_build_object('expected_version', p_expected_version, 'changes', p_changes);
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_request_id::text, 0));
  select * into current_row from public.observations where id = p_id for update;
  if not found or not public.can_mutate_observation(current_row, false) then
    raise sqlstate 'PT404' using message = 'NOT_FOUND';
  end if;
  if not public.can_mutate_observation(current_row, true) then
    raise sqlstate 'PT403' using message = 'FORBIDDEN';
  end if;
  select * into previous_request from public.observation_revisions
    where actor_id = auth.uid() and request_id = p_request_id;
  if found then
    if previous_request.observation_id = p_id and previous_request.action = 'update'
      and previous_request.request_payload = payload then return current_row; end if;
    raise sqlstate 'PT409' using message = 'IDEMPOTENCY_CONFLICT';
  end if;
  if current_row.version <> p_expected_version then
    raise sqlstate 'PT409' using message = 'VERSION_CONFLICT';
  end if;
  edited := jsonb_populate_record(current_row, p_changes);
  update public.observations set
    meal_period = edited.meal_period, meal = edited.meal, water = edited.water,
    bowel = edited.bowel, walking = edited.walking, urination = edited.urination,
    pain = edited.pain, skin = edited.skin, sleep = edited.sleep, mood = edited.mood,
    cognition = edited.cognition, communication = edited.communication, hygiene = edited.hygiene,
    oral_care = edited.oral_care, medication = edited.medication, activity = edited.activity,
    emotional_support = edited.emotional_support, version = current_row.version + 1,
    updated_at = clock_timestamp(), updated_by = auth.uid()
  where id = p_id returning * into edited;
  insert into public.observation_revisions
    (observation_id, version, action, actor_id, request_id, request_payload, snapshot)
  values (edited.id, edited.version, 'update', auth.uid(), p_request_id, payload, to_jsonb(edited));
  return edited;
exception
  when unique_violation then raise sqlstate 'PT409' using message = 'IDEMPOTENCY_CONFLICT';
  when check_violation or not_null_violation or invalid_text_representation or foreign_key_violation then
    raise sqlstate 'PT422' using message = 'VALIDATION_ERROR';
end $$;

revoke all on function public.observation_request_payload(public.observations) from public, anon, authenticated;
revoke all on function public.can_mutate_observation(public.observations, boolean) from public, anon, authenticated;
revoke all on function public.stamp_new_observation() from public, anon, authenticated;
revoke all on function public.audit_new_observation() from public, anon, authenticated;
revoke all on function public.create_observation(jsonb) from public, anon, authenticated;
revoke all on function public.update_observation(uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.create_observation(jsonb) to authenticated;
grant execute on function public.update_observation(uuid, uuid, integer, jsonb) to authenticated;

comment on table public.observation_revisions is
  'Append-only row snapshots and mutation request ledger. Baseline captures migration state, not past edit attribution. Reads follow current observation visibility.';
notify pgrst, 'reload schema';
commit;
