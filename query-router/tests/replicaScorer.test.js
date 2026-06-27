const test = require('node:test');
const assert = require('node:assert/strict');

const { calculateReplicaScore, clamp01 } = require('../src/routing/replicaScorer');

const baseConfig = {
  weights: { cpu: 0.3, memory: 0.25, connections: 0.2, latency: 0.25 },
  latencyTargetMs: 200,
  connectionCap: 10
};

test('clamp01 keeps values within the [0, 1] range', () => {
  assert.equal(clamp01(0.5), 0.5);
  assert.equal(clamp01(0), 0);
  assert.equal(clamp01(1), 1);
  assert.equal(clamp01(1.7), 1);
  assert.equal(clamp01(-3), 0);
});

test('clamp01 treats non-finite values as zero', () => {
  // The guard rejects any non-finite input, so Infinity collapses to 0 too.
  assert.equal(clamp01(NaN), 0);
  assert.equal(clamp01(Infinity), 0);
  assert.equal(clamp01(-Infinity), 0);
});

test('calculateReplicaScore returns Infinity for unhealthy or missing metrics', () => {
  assert.equal(calculateReplicaScore(null, baseConfig), Number.POSITIVE_INFINITY);
  assert.equal(calculateReplicaScore({ unhealthy: true }, baseConfig), Number.POSITIVE_INFINITY);
});

test('calculateReplicaScore returns 0 for a perfectly idle replica', () => {
  const metrics = {
    cpuPercent: 0,
    memoryPercent: 0,
    activeConnections: 0,
    averageLatencyMs: 0,
    isStale: false
  };
  assert.equal(calculateReplicaScore(metrics, baseConfig), 0);
});

test('calculateReplicaScore reaches the sum of weights when fully saturated', () => {
  const metrics = {
    cpuPercent: 100,
    memoryPercent: 100,
    activeConnections: 10, // equals connectionCap -> pressure 1
    averageLatencyMs: 200, // equals latencyTarget -> pressure 1
    isStale: false
  };
  const sumOfWeights = 0.3 + 0.25 + 0.2 + 0.25;
  assert.ok(Math.abs(calculateReplicaScore(metrics, baseConfig) - sumOfWeights) < 1e-9);
});

test('calculateReplicaScore ranks a busier replica higher than an idle one', () => {
  const idle = { cpuPercent: 5, memoryPercent: 10, activeConnections: 1, averageLatencyMs: 10, isStale: false };
  const busy = { cpuPercent: 70, memoryPercent: 60, activeConnections: 8, averageLatencyMs: 150, isStale: false };
  assert.ok(calculateReplicaScore(busy, baseConfig) > calculateReplicaScore(idle, baseConfig));
});

test('calculateReplicaScore applies a freshness penalty for stale metrics', () => {
  const fresh = { cpuPercent: 20, memoryPercent: 20, activeConnections: 2, averageLatencyMs: 20, isStale: false };
  const stale = { ...fresh, isStale: true };
  const delta = calculateReplicaScore(stale, baseConfig) - calculateReplicaScore(fresh, baseConfig);
  assert.ok(Math.abs(delta - 0.5) < 1e-9, `expected a 0.5 stale penalty, got ${delta}`);
});

test('calculateReplicaScore clamps pressures so over-saturation does not exceed caps', () => {
  const overloaded = {
    cpuPercent: 400,
    memoryPercent: 400,
    activeConnections: 1000,
    averageLatencyMs: 5000,
    isStale: false
  };
  const sumOfWeights = 0.3 + 0.25 + 0.2 + 0.25;
  // All individual pressures clamp to 1, so the score cannot exceed the sum of weights.
  assert.ok(calculateReplicaScore(overloaded, baseConfig) <= sumOfWeights + 1e-9);
});

test('calculateReplicaScore guards against a zero connection cap', () => {
  const metrics = { cpuPercent: 0, memoryPercent: 0, activeConnections: 5, averageLatencyMs: 0, isStale: false };
  const score = calculateReplicaScore(metrics, { ...baseConfig, connectionCap: 0 });
  assert.ok(Number.isFinite(score));
});
