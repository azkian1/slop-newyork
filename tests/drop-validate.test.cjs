const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { loadModule } = require('./helpers/module.cjs');

const root = join(__dirname, '..');
const rng = loadModule(readFileSync(join(root, 'js/drop-rng.js'), 'utf8'));
const place = loadModule(readFileSync(join(root, 'js/drop-place.js'), 'utf8'), { imports: { './drop-rng.js': rng } });
const validate = loadModule(readFileSync(join(root, 'js/drop-validate.js'), 'utf8'), { imports: { './drop-place.js': place } });
const config = loadModule(readFileSync(join(root, 'js/drops-config.js'), 'utf8'));
const {
  validateDropRecord, parseRemoteDocument, fetchRemoteDocument,
  acceptLocalRecords, acceptRemoteRecords, xProfileUrl, MAX_REMOTE_BYTES
} = validate;
const { DROPS_REMOTE_URL, DROPS_POLL_MS, pollDue } = config;

const local = JSON.parse(readFileSync(join(root, 'data/drops.json'), 'utf8'));

function good() {
  return structuredClone(local[0]);
}

test('local demo drops pass the whitelist', () => {
  for (const row of local) assert.equal(validateDropRecord(row).length, 0);
  assert.equal(acceptLocalRecords(local).length, local.length);
});

test('the profile link is only the x.com handle', () => {
  assert.equal(xProfileUrl('azaticus'), 'https://x.com/azaticus');
  assert.equal(xProfileUrl('javascript:alert(1)'), null);
  assert.equal(xProfileUrl('https://evil.example'), null);
  assert.equal(xProfileUrl('a b'), null);
});

test('a remote file keeps good records and drops hostile ones', () => {
  const ok = good();
  ok.id = 'drop-remote-ok';
  ok.sourceId = 'remote-ok';
  const unknown = good();
  unknown.id = 'drop-remote-extra';
  unknown.sourceId = 'remote-extra';
  unknown.evil = true;
  const tagged = good();
  tagged.id = 'drop-remote-tag';
  tagged.sourceId = 'remote-tag';
  tagged.name = '<script>alert(1)</script>';
  const author = good();
  author.id = 'drop-remote-author';
  author.sourceId = 'remote-author';
  author.author = 'javascript:alert(1)';
  const nan = good();
  nan.id = 'drop-remote-nan';
  nan.sourceId = 'remote-nan';
  nan.x = NaN;
  const huge = good();
  huge.id = 'drop-remote-huge';
  huge.sourceId = 'remote-huge';
  huge.spec.shapes = Array.from({ length: 10000 }, () => huge.spec.shapes[0]);
  const warns = [];
  const ids = new Set(local.map((row) => row.id));
  const duplicate = good();
  const { taken } = acceptRemoteRecords(
    [ok, unknown, tagged, author, nan, huge, duplicate],
    { ids, warn: (message) => warns.push(message) }
  );
  assert.equal(taken.map((row) => row.id).join(','), 'drop-remote-ok');
  assert.equal(ids.has('drop-demo-snowman'), true);
  assert.equal(warns.length, 5);
  assert.ok(warns.some((line) => /unknown or missing key/.test(line)));
  assert.ok(warns.some((line) => /name must be plain ASCII/.test(line)));
  assert.ok(warns.some((line) => /author is not an X handle/.test(line)));
  assert.ok(warns.some((line) => /x is outside the city/.test(line)));
  assert.ok(warns.some((line) => /spec.shapes/.test(line)));
});

test('an oversized or unreadable remote document adds nothing', () => {
  assert.equal(parseRemoteDocument('x'.repeat(MAX_REMOTE_BYTES + 1)), null);
  assert.equal(parseRemoteDocument('{'), null);
  assert.equal(parseRemoteDocument('{"id":"nope"}'), null);
  assert.equal(parseRemoteDocument('[]').length, 0);
});

test('a 404 remote fetch is empty and silent', async () => {
  const warns = [];
  const rows = await fetchRemoteDocument('https://example.test/drops.json', {
    fetchImpl: async () => ({ ok: false, status: 404, text: async () => 'missing' })
  });
  assert.equal(rows.length, 0);
  assert.equal(warns.length, 0);
  const bad = await fetchRemoteDocument('https://example.test/drops.json', {
    fetchImpl: async () => { throw new Error('network down'); }
  });
  assert.equal(bad.length, 0);
});

test('polling waits three minutes, throttles focus, and pauses while hidden', () => {
  assert.equal(DROPS_REMOTE_URL, 'https://raw.githubusercontent.com/azkian1/slop-newyork-drops/main/drops.json');
  assert.equal(DROPS_POLL_MS, 180000);
  assert.equal(pollDue(0, 180000, false, 'interval'), true);
  assert.equal(pollDue(0, 179000, false, 'interval'), false);
  assert.equal(pollDue(0, 30000, false, 'focus'), true);
  assert.equal(pollDue(0, 29999, false, 'focus'), false);
  assert.equal(pollDue(0, 999999, true, 'interval'), false);
  assert.equal(pollDue(0, 999999, true, 'focus'), false);
});

test('the game does not put drop data through innerHTML or a data URL', () => {
  const source = readFileSync(join(root, 'js/drops.js'), 'utf8');
  assert.equal(source.includes('innerHTML'), false);
  assert.equal(source.includes('eval('), false);
  assert.equal(source.includes('new Function'), false);
  assert.match(source, /DROPS_REMOTE_URL/);
  assert.match(source, /textContent/);
  assert.match(source, /xProfileUrl\(author\)/);
  assert.match(source, /cache: 'no-store'/);
});
