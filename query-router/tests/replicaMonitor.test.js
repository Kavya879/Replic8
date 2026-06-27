const test = require('node:test');
const assert = require('node:assert/strict');

const { createReplicaMonitor } = require('../src/monitoring/replicaMonitor');

// The monitor logs to the console and attempts to read Docker stats during a
// refresh. We silence the console so the test output stays readable; the Docker
// stats call fails fast off-cluster and falls back to 0% CPU/memory, which is
// exactly what we want for deterministic assertions.
const originalConsole = { log: console.log, warn: console.warn, error: console.error };
test.before(() => {
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
});
test.after(() => {
  Object.assign(console, originalConsole);
});

const config = {
  weights: { cpu: 0.3, memory: 0.25, connections: 0.2, latency: 0.25 },
  latencyTargetMs: 200,
  poolMax: 10,
  staleReplicaThresholdMs: 15000,
  monitorIntervalMs: 5000
};

// Builds a fake cluster node backed by a pool that answers the two queries the
// monitor issues during refreshNode: the activity/recovery probe and `SELECT 1`.
function makeNode(name, { inRecovery = true, activeConnections = 2, fail = false } = {}) {
  return {
    name,
    serviceName: name,
    isConfiguredPrimary: !inRecovery,
    pool: {
      query: async (arg) => {
        if (fail) {
          throw Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
        }
        const text = typeof arg === 'string' ? arg : arg.text;
        if (text.includes('pg_stat_activity')) {
          return { rows: [{ active_connections: activeConnections, in_recovery: inRecovery }] };
        }
        return { rows: [{ result: 1 }] };
      }
    }
  };
}

test('a fresh monitor reports every node as Down before the first refresh', () => {
  const monitor = createReplicaMonitor([makeNode('postgres-primary', { inRecovery: false }), makeNode('postgres-replica-1')], config);
  const snapshot = monitor.getStateSnapshot();
  assert.equal(snapshot.length, 2);
  assert.ok(snapshot.every((node) => node.status === 'Down'));
  assert.equal(monitor.getRoutingSnapshot().length, 0);
});

test('refreshAll marks healthy nodes and identifies the primary by recovery state', async () => {
  const nodes = [
    makeNode('postgres-primary', { inRecovery: false, activeConnections: 3 }),
    makeNode('postgres-replica-1', { inRecovery: true, activeConnections: 2 }),
    makeNode('postgres-replica-2', { inRecovery: true, activeConnections: 6 })
  ];
  const monitor = createReplicaMonitor(nodes, config);

  await monitor.refreshAll();

  const primary = monitor.getPrimaryNode();
  assert.equal(primary.name, 'postgres-primary');
  assert.equal(primary.role, 'Primary');

  const byName = Object.fromEntries(monitor.getStateSnapshot().map((n) => [n.name, n]));
  assert.equal(byName['postgres-replica-1'].status, 'Healthy');
  assert.equal(byName['postgres-replica-1'].role, 'Replica');
});

test('getRoutingSnapshot returns only replicas ordered by ascending load score', async () => {
  const nodes = [
    makeNode('postgres-primary', { inRecovery: false }),
    makeNode('postgres-replica-1', { inRecovery: true, activeConnections: 2 }),
    makeNode('postgres-replica-2', { inRecovery: true, activeConnections: 6 })
  ];
  const monitor = createReplicaMonitor(nodes, config);

  await monitor.refreshAll();
  const routing = monitor.getRoutingSnapshot();

  assert.deepEqual(routing.map((n) => n.name), ['postgres-replica-1', 'postgres-replica-2']);
  assert.ok(routing.every((n) => n.role === 'Replica'));
  assert.ok(routing[0].score <= routing[1].score);
});

test('a replica near the connection cap is flagged as Warning', async () => {
  const nodes = [
    makeNode('postgres-primary', { inRecovery: false }),
    // 8 active connections == 80% of poolMax (10) -> Warning threshold.
    makeNode('postgres-replica-1', { inRecovery: true, activeConnections: 8 })
  ];
  const monitor = createReplicaMonitor(nodes, config);

  await monitor.refreshAll();
  const replica = monitor.getStateSnapshot().find((n) => n.name === 'postgres-replica-1');
  assert.equal(replica.status, 'Warning');
});

test('an unreachable replica is marked Down and excluded from routing', async () => {
  const nodes = [
    makeNode('postgres-primary', { inRecovery: false }),
    makeNode('postgres-replica-1', { inRecovery: true, activeConnections: 2 }),
    makeNode('postgres-replica-2', { inRecovery: true, fail: true })
  ];
  const monitor = createReplicaMonitor(nodes, config);

  await monitor.refreshAll();

  const replica2 = monitor.getStateSnapshot().find((n) => n.name === 'postgres-replica-2');
  assert.equal(replica2.status, 'Down');
  assert.deepEqual(monitor.getRoutingSnapshot().map((n) => n.name), ['postgres-replica-1']);
});

test('markReplicaFailed removes a replica from rotation and a later refresh restores it', async () => {
  const nodes = [
    makeNode('postgres-primary', { inRecovery: false }),
    makeNode('postgres-replica-1', { inRecovery: true, activeConnections: 2 })
  ];
  const monitor = createReplicaMonitor(nodes, config);
  await monitor.refreshAll();

  monitor.markReplicaFailed('postgres-replica-1', 'boom');
  assert.equal(monitor.getRoutingSnapshot().length, 0);
  let replica = monitor.getStateSnapshot().find((n) => n.name === 'postgres-replica-1');
  assert.equal(replica.status, 'Down');
  assert.equal(replica.metrics.failureCount, 1);

  // markReplicaRecovered clears the failure bookkeeping (counter + last error)...
  monitor.markReplicaRecovered('postgres-replica-1');
  replica = monitor.getStateSnapshot().find((n) => n.name === 'postgres-replica-1');
  assert.equal(replica.metrics.failureCount, 0);
  assert.equal(replica.metrics.lastError, null);

  // ...and the next monitoring sweep re-probes the node and returns it to rotation.
  await monitor.refreshAll();
  assert.deepEqual(monitor.getRoutingSnapshot().map((n) => n.name), ['postgres-replica-1']);
});

test('updateQueryLatency blends observed latency into the running average', async () => {
  const nodes = [
    makeNode('postgres-primary', { inRecovery: false }),
    makeNode('postgres-replica-1', { inRecovery: true, activeConnections: 2 })
  ];
  const monitor = createReplicaMonitor(nodes, config);
  await monitor.refreshAll();

  // Seed a known baseline first (the mocked probe resolves in ~0ms), then feed a
  // slow query and assert the new value is a smoothed blend rather than a replacement.
  monitor.updateQueryLatency('postgres-replica-1', 100);
  const before = monitor.getStateSnapshot().find((n) => n.name === 'postgres-replica-1').metrics.averageLatencyMs;
  assert.equal(before, 100);

  monitor.updateQueryLatency('postgres-replica-1', 500);
  const after = monitor.getStateSnapshot().find((n) => n.name === 'postgres-replica-1').metrics.averageLatencyMs;

  assert.ok(after > before, 'a slow query should raise the running average latency');
  assert.ok(after < 500, 'the average should be smoothed, not replaced outright');
});

test('subscribe receives cluster snapshots emitted on refresh', async () => {
  const nodes = [makeNode('postgres-primary', { inRecovery: false }), makeNode('postgres-replica-1')];
  const monitor = createReplicaMonitor(nodes, config);

  const received = [];
  const unsubscribe = monitor.subscribe((payload) => received.push(payload));

  await monitor.refreshAll();
  assert.ok(received.length >= 1);
  assert.equal(received[0].reason, 'refresh');
  assert.ok(Array.isArray(received[0].replicas));

  unsubscribe();
  const countAfterUnsubscribe = received.length;
  await monitor.refreshAll();
  assert.equal(received.length, countAfterUnsubscribe, 'unsubscribed listener should stop receiving updates');
});
