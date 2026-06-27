const test = require('node:test');
const assert = require('node:assert/strict');

const { createQueryStatsTracker } = require('../src/monitoring/queryStats');

test('an empty tracker reports zeros', () => {
  const tracker = createQueryStatsTracker();
  const snapshot = tracker.snapshot();
  assert.deepEqual(snapshot, {
    p50LatencyMs: 0,
    p95LatencyMs: 0,
    p99LatencyMs: 0,
    requestsPerSecond: 0,
    sampleCount: 0
  });
});

test('tracker computes real percentiles over recorded latencies', () => {
  const tracker = createQueryStatsTracker();
  for (let ms = 1; ms <= 100; ms += 1) {
    tracker.record(ms);
  }
  const snapshot = tracker.snapshot();
  assert.equal(snapshot.sampleCount, 100);
  // For 1..100, the linear-interpolation p50 is ~50.5 and p95 ~95.05.
  assert.ok(Math.abs(snapshot.p50LatencyMs - 50.5) < 1e-9);
  assert.ok(snapshot.p95LatencyMs > snapshot.p50LatencyMs);
  assert.ok(snapshot.p99LatencyMs >= snapshot.p95LatencyMs);
});

test('tracker ignores invalid latency samples', () => {
  const tracker = createQueryStatsTracker();
  tracker.record(NaN);
  tracker.record(-5);
  tracker.record(Infinity);
  tracker.record('slow');
  assert.equal(tracker.snapshot().sampleCount, 0);
});

test('requestsPerSecond reflects samples within the rps window', () => {
  // rpsWindowMs = 1000 -> requestsPerSecond == count of recent samples / 1.
  const tracker = createQueryStatsTracker({ rpsWindowMs: 1000 });
  for (let i = 0; i < 12; i += 1) {
    tracker.record(5);
  }
  assert.equal(tracker.snapshot().requestsPerSecond, 12);
});

test('samples older than the window are pruned from percentiles', async () => {
  const tracker = createQueryStatsTracker({ windowMs: 50, rpsWindowMs: 50 });
  tracker.record(100);
  assert.equal(tracker.snapshot().sampleCount, 1);

  await new Promise((resolve) => setTimeout(resolve, 80));
  // The old sample is now outside the 50ms window and should be pruned on snapshot.
  assert.equal(tracker.snapshot().sampleCount, 0);
});
