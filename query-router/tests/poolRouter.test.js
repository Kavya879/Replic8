const test = require('node:test');
const assert = require('node:assert/strict');

const { createPoolRouter } = require('../src/routing/poolRouter');

function connectionError(code = 'ECONNREFUSED') {
  return Object.assign(new Error(`connection failed (${code})`), { code });
}

// Builds a fake replica node whose pool.query resolves to a tagged result,
// or rejects with the supplied error.
function makeReplica(name, { error = null, rows = [] } = {}) {
  return {
    name,
    pool: {
      query: async () => {
        if (error) {
          throw error;
        }
        return { command: 'SELECT', rowCount: rows.length, rows, servedBy: name };
      }
    }
  };
}

// A configurable stub of the cluster monitor that records the calls the
// router makes against it so we can assert on routing behaviour.
function makeMonitor({ replicas = [], primary = null } = {}) {
  const calls = { latency: [], failed: [], recovered: [], recorded: [] };
  return {
    calls,
    getRoutingSnapshot: () => replicas,
    getPrimaryNode: () => primary,
    updateQueryLatency: (name, ms) => calls.latency.push({ name, ms }),
    recordQuery: (ms) => calls.recorded.push(ms),
    markReplicaFailed: (name, message) => calls.failed.push({ name, message }),
    markReplicaRecovered: (name) => calls.recovered.push(name)
  };
}

test('routeRead executes against the first replica in the routing snapshot', async () => {
  const monitor = makeMonitor({ replicas: [makeReplica('replica-1', { rows: [{ id: 1 }] }), makeReplica('replica-2')] });
  const router = createPoolRouter(monitor);

  const { poolLabel, result } = await router.routeRead('SELECT 1', []);

  assert.equal(poolLabel, 'replica-1');
  assert.equal(result.servedBy, 'replica-1');
  assert.equal(monitor.calls.recovered[0], 'replica-1');
  assert.equal(monitor.calls.latency.length, 1);
  assert.equal(monitor.calls.recorded.length, 1);
  assert.equal(monitor.calls.failed.length, 0);
});

test('routeRead fails over to the next replica on a retryable connection error', async () => {
  const monitor = makeMonitor({
    replicas: [
      makeReplica('replica-1', { error: connectionError('ECONNREFUSED') }),
      makeReplica('replica-2', { rows: [{ ok: true }] })
    ]
  });
  const router = createPoolRouter(monitor);

  const { poolLabel } = await router.routeRead('SELECT 1', []);

  assert.equal(poolLabel, 'replica-2');
  assert.deepEqual(monitor.calls.failed.map((f) => f.name), ['replica-1']);
  assert.equal(monitor.calls.recovered[0], 'replica-2');
});

test('routeRead does not retry on a non-retryable (query) error', async () => {
  const queryError = Object.assign(new Error('syntax error'), { code: '42601' });
  const monitor = makeMonitor({
    replicas: [makeReplica('replica-1', { error: queryError }), makeReplica('replica-2', { rows: [{ ok: true }] })]
  });
  const router = createPoolRouter(monitor);

  await assert.rejects(() => router.routeRead('SELECT bad', []), /syntax error/);
  assert.deepEqual(monitor.calls.failed.map((f) => f.name), ['replica-1']);
  assert.equal(monitor.calls.recovered.length, 0, 'replica-2 should never be tried');
});

test('routeRead throws the last error when every replica fails with a retryable error', async () => {
  const monitor = makeMonitor({
    replicas: [
      makeReplica('replica-1', { error: connectionError('ETIMEDOUT') }),
      makeReplica('replica-2', { error: connectionError('57P01') })
    ]
  });
  const router = createPoolRouter(monitor);

  await assert.rejects(() => router.routeRead('SELECT 1', []), /57P01/);
  assert.deepEqual(monitor.calls.failed.map((f) => f.name), ['replica-1', 'replica-2']);
});

test('routeRead falls back to the primary when no replicas are available', async () => {
  const monitor = makeMonitor({ replicas: [], primary: makeReplica('primary', { rows: [{ id: 9 }] }) });
  const router = createPoolRouter(monitor);

  const { poolLabel, result } = await router.routeRead('SELECT 1', []);

  assert.equal(poolLabel, 'primary');
  assert.equal(result.servedBy, 'primary');
  assert.equal(monitor.calls.latency[0].name, 'primary');
});

test('routeRead throws when no replicas and no primary are available', async () => {
  const monitor = makeMonitor({ replicas: [], primary: null });
  const router = createPoolRouter(monitor);

  await assert.rejects(() => router.routeRead('SELECT 1', []), /No database pools are available/);
});

test('routeWrite always targets the primary node', async () => {
  const monitor = makeMonitor({ primary: makeReplica('primary', { rows: [{ inserted: 1 }] }) });
  const router = createPoolRouter(monitor);

  const { poolLabel, result } = await router.routeWrite('INSERT INTO t VALUES ($1)', [1]);

  assert.equal(poolLabel, 'primary');
  assert.equal(result.servedBy, 'primary');
  assert.equal(monitor.calls.recorded.length, 1, 'writes should also feed the query-stats log');
});

test('routeWrite throws when there is no active primary', async () => {
  const monitor = makeMonitor({ primary: null });
  const router = createPoolRouter(monitor);

  await assert.rejects(() => router.routeWrite('INSERT INTO t VALUES ($1)', [1]), /No active primary/);
});
