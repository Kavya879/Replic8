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
function makeNode(name, { inRecovery = true, activeConnections = 2, fail = false, replayLagSeconds = 0, walLsn = null } = {}) {
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
          return {
            rows: [{
              active_connections: activeConnections,
              in_recovery: inRecovery,
              wal_lsn: walLsn,
              replay_lag_seconds: inRecovery ? replayLagSeconds : 0
            }]
          };
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

test('subscribe receives cluster snapshots emitted on refresh', async () => {  const nodes = [makeNode('postgres-primary', { inRecovery: false }), makeNode('postgres-replica-1')];
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

test('getClusterSnapshot reports the worst-case replication lag across replicas', async () => {
  const nodes = [
    makeNode('postgres-primary', { inRecovery: false }),
    makeNode('postgres-replica-1', { inRecovery: true, replayLagSeconds: 0.25 }), // 250ms
    makeNode('postgres-replica-2', { inRecovery: true, replayLagSeconds: 1.5 })   // 1500ms
  ];
  const monitor = createReplicaMonitor(nodes, config);
  await monitor.refreshAll();

  const snapshot = monitor.getClusterSnapshot();
  assert.equal(snapshot.system.replicationLagMs, 1500);
});

test('a caught-up replica reports zero replication lag', async () => {
  const nodes = [
    makeNode('postgres-primary', { inRecovery: false }),
    makeNode('postgres-replica-1', { inRecovery: true, replayLagSeconds: 0 })
  ];
  const monitor = createReplicaMonitor(nodes, config);
  await monitor.refreshAll();

  assert.equal(monitor.getClusterSnapshot().system.replicationLagMs, 0);
});

test('recordQuery drives real latency percentiles and requests-per-second', async () => {
  const nodes = [makeNode('postgres-primary', { inRecovery: false }), makeNode('postgres-replica-1')];
  const monitor = createReplicaMonitor(nodes, config);
  await monitor.refreshAll();

  // 100 samples ranging 1..100ms -> p50 ~50.5, p95 ~95.05.
  for (let ms = 1; ms <= 100; ms += 1) {
    monitor.recordQuery(ms);
  }

  const { queries } = monitor.getClusterSnapshot();
  assert.ok(queries.p50LatencyMs > 45 && queries.p50LatencyMs < 56, `p50 out of range: ${queries.p50LatencyMs}`);
  assert.ok(queries.p95LatencyMs > 90 && queries.p95LatencyMs <= 100, `p95 out of range: ${queries.p95LatencyMs}`);
  assert.ok(queries.p95LatencyMs >= queries.p50LatencyMs);
  // All 100 samples fall in the 5s RPS window -> 100 / 5 = 20 req/s.
  assert.ok(queries.requestsPerSecond > 0, 'requestsPerSecond should be non-zero after recording queries');
});

test('recordQuery ignores non-finite latencies', async () => {
  const nodes = [makeNode('postgres-primary', { inRecovery: false }), makeNode('postgres-replica-1')];
  const monitor = createReplicaMonitor(nodes, config);
  await monitor.refreshAll();

  monitor.recordQuery(NaN);
  monitor.recordQuery(Infinity);
  monitor.recordQuery(undefined);

  assert.equal(monitor.getClusterSnapshot().queries.requestsPerSecond, 0);
});

test('refreshAll computes byte-level replication lag against the primary WAL position', async () => {
  const nodes = [
    // Primary current WAL position: 0x16/0x100 bytes.
    makeNode('postgres-primary', { inRecovery: false, walLsn: '16/100' }),
    // Replica fully caught up.
    makeNode('postgres-replica-1', { inRecovery: true, walLsn: '16/100', replayLagSeconds: 0 }),
    // Replica 0x40 (64) bytes behind.
    makeNode('postgres-replica-2', { inRecovery: true, walLsn: '16/C0', replayLagSeconds: 0.5 })
  ];
  const monitor = createReplicaMonitor(nodes, config);

  await monitor.refreshAll();

  const byName = Object.fromEntries(monitor.getStateSnapshot().map((n) => [n.name, n]));
  assert.equal(byName['postgres-replica-1'].metrics.replicationLagBytes, 0);
  assert.equal(byName['postgres-replica-2'].metrics.replicationLagBytes, 0x100 - 0xc0); // 64 bytes

  const snapshot = monitor.getClusterSnapshot();
  assert.equal(snapshot.system.replicationLagBytes, 64);
});

test('getClusterSnapshot reports real query percentiles and throughput from recorded latencies', async () => {
  const nodes = [
    makeNode('postgres-primary', { inRecovery: false }),
    makeNode('postgres-replica-1', { inRecovery: true })
  ];
  const monitor = createReplicaMonitor(nodes, config);
  await monitor.refreshAll();

  for (const ms of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
    monitor.recordQuery(ms);
  }

  const { queries } = monitor.getClusterSnapshot();
  assert.ok(queries.p50LatencyMs > 0 && queries.p50LatencyMs < queries.p95LatencyMs);
  assert.ok(queries.p95LatencyMs <= 100);
  assert.ok(queries.requestsPerSecond > 0, 'recent queries should yield a positive RPS');
});
