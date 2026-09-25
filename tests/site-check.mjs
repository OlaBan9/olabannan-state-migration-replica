/* Static self-checks for olabannan-state-migration-replica.
 *
 * No browser needed: asserts the submission contract straight from the repo
 * files — required files exist, features.json holds exactly 5 must-have
 * rubrics, site.toml routes as webcraft-2.0, the page makes no external
 * requests, vendored assets are present, and the dataset header is intact.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(new URL('.', import.meta.url).pathname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('required submission files exist and are non-empty', () => {
  for (const f of [
    'index.html', 'styles.css', 'app.js', 'server.js',
    'package.json', 'package-lock.json', '.env.example',
    'state_to_state_migration_normalized.csv',
    'vendor/d3.min.js', 'vendor/topojson-client.min.js', 'vendor/states-10m.json',
    'site.toml', 'app.toml', 'docker-compose.yml', 'environment/Dockerfile',
    'verify.sh',
    'PRD.md', 'features.json', 'instruction.md', 'SETUP.md',
    'THIRD_PARTY_NOTICES.md',
  ]) {
    assert.ok(existsSync(join(ROOT, f)), `missing: ${f}`);
    assert.ok(statSync(join(ROOT, f)).size > 0, `empty: ${f}`);
  }
});

test('features.json holds exactly 5 must-have rubrics', () => {
  const features = JSON.parse(read('features.json'));
  assert.equal(features.rubrics.length, 5);
  for (const r of features.rubrics) {
    assert.ok(Number.isInteger(r.id));
    assert.ok(typeof r.criterion === 'string' && r.criterion.length > 50);
    assert.ok(['CUJ', 'design'].includes(r.type), `bad type: ${r.type}`);
    assert.equal(r.priority, 'must-have');
  }
});

test('site routes as webcraft-2.0 with a single compose service', () => {
  assert.match(read('site.toml'), /category\s*=\s*"webcraft-2\.0"/);
  const compose = read('docker-compose.yml');
  assert.equal(compose.match(/^  [A-Za-z_][\w-]*:/gm).length, 1);
});

test('page makes no external requests', () => {
  // W3C namespace identifiers (e.g. in the inline-SVG favicon) are names,
  // not fetches — everything else http(s) is a real dependency.
  const allowlist = ['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink'];
  for (const f of ['index.html', 'app.js', 'styles.css']) {
    const urls = (read(f).match(/https?:\/\/[^"'\s)]+/g) || [])
      .filter((u) => !allowlist.some((a) => u.startsWith(a)));
    assert.deepEqual(urls, [], `${f} references: ${urls.join(', ')}`);
  }
});

test('dataset header carries the expected columns', () => {
  const header = read('state_to_state_migration_normalized.csv').split('\n')[0];
  for (const col of ['year_start', 'from_state', 'to_state', 'estimate']) {
    assert.ok(header.split(',').includes(col), `missing column: ${col}`);
  }
});
