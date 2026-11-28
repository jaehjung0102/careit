// Run against B2's checkout until #63 is merged; never copy its calculator here.
const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const { readFileSync, mkdtempSync, rmSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { resolve, join } = require('node:path');
const { tmpdir } = require('node:os');
const fixture = require('./fixtures/comparison.json');
const web = resolve(process.env.COMPARISON_WEB_DIR || 'web');
const compiler = resolve('web/node_modules/typescript/bin/tsc');
const output = mkdtempSync(join(tmpdir(), 'careit-comparison-'));
try {
  execFileSync(process.execPath, [compiler, '--target', 'es2022', '--module', 'commonjs',
    '--skipLibCheck', '--outDir', output,
    join(web, 'src/lib/analytics/meal-comparison.ts'),
    join(web, 'src/lib/analytics/water-comparison.ts')], { stdio: 'inherit' });
} catch (error) {
  rmSync(output, { recursive: true, force: true });
  throw error;
}
after(() => rmSync(output, { recursive: true, force: true }));
const { compareMeal } = require(join(output, 'meal-comparison.js'));
const { compareWater } = require(join(output, 'water-comparison.js'));
const records = new Map(fixture.records.map(row => [row.record.id, row.record]));
const current = records.get(fixture.current_id);

test('fixture identities, scopes and comparison timestamps are explicit', () => {
  assert.equal(fixture.data_source, 'mock');
  assert.equal(fixture.timezone, 'Asia/Seoul');
  assert.equal(records.size, fixture.records.length);
  assert.ok(Number.isFinite(Date.parse(fixture.evaluated_at)));
  for (const row of fixture.records) {
    assert.ok(fixture.actors[row.author]);
    assert.ok(Number.isFinite(Date.parse(row.record.observed_at)));
    if (row.team_id !== null) {
      assert.equal(fixture.actors[row.author].team_id, row.team_id);
      assert.ok(fixture.residents.some(r => r.id === row.record.resident_id && r.team_id === row.team_id));
    }
  }
  // Neither the fixture nor the test claims real approval or storage timestamps.
  assert.ok(!readFileSync(join(__dirname, 'fixtures/comparison.json'), 'utf8').includes('created_at'));
});

for (const scenario of fixture.cases) {
  test(scenario.name, () => {
    const patch = scenario.current_patch;
    const record = { ...current, ...patch, fields: { ...current.fields, ...patch.fields },
      water_measurement: { ...current.water_measurement, ...patch.water_measurement } };
    const history = scenario.history_ids.map(id => {
      assert.ok(records.has(id), `Unknown history ID: ${id}`);
      return records.get(id);
    });
    const before = JSON.stringify({ record, history });
    const results = { meal: compareMeal(record, history),
      water: compareWater(record, history, new Date(fixture.evaluated_at)) };
    for (const metric of ['meal', 'water']) {
      for (const [key, value] of Object.entries(scenario.expected[metric])) {
        assert.deepEqual(results[metric][key], value, `${metric}.${key}`);
      }
      assert.equal(results[metric].evidence.length, results[metric].valid_count);
      assert.ok(results[metric].evidence.every(row => scenario.history_ids.includes(row.observation_id)));
    }
    assert.equal(JSON.stringify({ record, history }), before, 'Source snapshots mutated');
  });
}
