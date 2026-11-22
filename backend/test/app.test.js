// Tests use FAKE Postgres and Redis objects, so no real database is needed.
// Run: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { createApp, CACHE_KEY } = require('../app');

// --- Fake Redis: stores values in a Map ---
const fakeRedis = {
  store: new Map(),
  async get(k) { return this.store.get(k) ?? null; },
  async set(k, v) { this.store.set(k, v); },
  async del(k) { this.store.delete(k); },
  async ping() { return 'PONG'; },
};

// --- Fake Postgres: keeps notes in an array and counts SELECTs ---
const fakePool = {
  notes: [],
  selects: 0,
  async query(sql, params) {
    if (sql.startsWith('SELECT 1')) return { rows: [{ '?column?': 1 }] };
    if (sql.startsWith('SELECT')) {
      this.selects++;
      return { rows: [...this.notes].reverse() };
    }
    if (sql.startsWith('INSERT')) {
      const note = { id: this.notes.length + 1, text: params[0], created_at: new Date().toISOString() };
      this.notes.push(note);
      return { rows: [note] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  },
};

let server;
let baseUrl;

before(() => {
  server = createApp({ pool: fakePool, redis: fakeRedis }).listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test('health and readiness return 200', async () => {
  assert.strictEqual((await fetch(`${baseUrl}/api/health`)).status, 200);
  assert.strictEqual((await fetch(`${baseUrl}/api/ready`)).status, 200);
});

test('first read comes from the database, second from the cache', async () => {
  fakeRedis.store.clear();
  const first = await (await fetch(`${baseUrl}/api/notes`)).json();
  const second = await (await fetch(`${baseUrl}/api/notes`)).json();
  assert.strictEqual(first.source, 'database');
  assert.strictEqual(second.source, 'cache');
  assert.strictEqual(fakePool.selects, 1); // the database was only asked once
});

test('creating a note clears the cache', async () => {
  const res = await fetch(`${baseUrl}/api/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Hello EKS' }),
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(fakeRedis.store.has(CACHE_KEY), false);

  const list = await (await fetch(`${baseUrl}/api/notes`)).json();
  assert.strictEqual(list.source, 'database');
  assert.strictEqual(list.notes[0].text, 'Hello EKS');
});

test('rejects an empty note', async () => {
  const res = await fetch(`${baseUrl}/api/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '   ' }),
  });
  assert.strictEqual(res.status, 400);
});

test('metrics endpoint works', async () => {
  const text = await (await fetch(`${baseUrl}/metrics`)).text();
  assert.match(text, /cache_requests_total/);
});
