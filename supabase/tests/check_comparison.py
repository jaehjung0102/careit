"""Run #20 in an isolated disposable DB; requires Docker, no Supabase account."""
from pathlib import Path
import json
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
IMAGE = 'public.ecr.aws/supabase/postgres:17.12.0.000'
BOOTSTRAP = """
-- Only in this disposable container: emulate verified JWT claims for SQL RLS tests.
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key, is_anonymous boolean);
alter table auth.users add column if not exists is_anonymous boolean;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb;
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select (auth.jwt()->>'sub')::uuid;
$$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
"""


def run(args, sql=None):
    result = subprocess.run(args, input=sql, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout


def main():
    fixture_path = ROOT / 'supabase/tests/fixtures/comparison.json'
    fixture = json.loads(fixture_path.read_text())
    assert fixture['data_source'] == 'mock'
    name = 'careit20-check-' + uuid.uuid4().hex[:12]
    run(['docker', 'info', '--format', '{{.ServerVersion}}'])
    started = False
    try:
        run(['docker', 'run', '-d', '--rm', '--network', 'none', '--name', name,
             '-e', 'POSTGRES_PASSWORD=disposable-fixture-only', IMAGE])
        started = True
        for _ in range(60):
            ready = subprocess.run(['docker', 'exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'supabase_admin'],
                                   capture_output=True)
            if ready.returncode == 0:
                break
            time.sleep(0.5)
        else:
            raise RuntimeError('Temporary PostgreSQL did not become ready within 30 seconds')
        psql = ['docker', 'exec', '-i', name, 'psql', '-X', '-U', 'supabase_admin',
                '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
        run(psql, BOOTSTRAP)
        for migration in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
            run(psql, migration.read_text())
        run(psql, (ROOT / 'supabase/seed.sql').read_text())
        for test in ['team_resident_foundation', 'team_observations', 'observation_revisions', 'comparison_fixtures']:
            args = psql
            if test == 'comparison_fixtures':
                args = psql + ['-v', 'fixture_json=' + fixture_path.read_text()]
            run(args, (ROOT / f'supabase/tests/{test}.sql').read_text())
            print(f'PASS {test}', flush=True)
        run(psql, """do $$ begin
          assert not exists (select 1 from auth.users where id::text like '20000000-%');
          assert not exists (select 1 from public.teams where id::text like '20000000-%');
          assert not exists (select 1 from public.observations where id::text like '20000000-%');
          assert not exists (select 1 from public.observation_revisions where observation_id::text like '20000000-%');
        end $$;""")
        print('PASS fixture rollback (users, teams, observations, revisions)', flush=True)
    finally:
        if started:
            run(['docker', 'stop', name])
            print('Removed disposable test container', flush=True)


if __name__ == '__main__':
    main()
