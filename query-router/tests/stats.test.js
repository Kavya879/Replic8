const test = require('node:test');
const assert = require('node:assert/strict');

const { percentile, average, summarize, round } = require('../benchmarks/stats');

test('percentile returns 0 for an empty sample', () => {
  assert.equal(percentile([], 95), 0);
});

test('percentile returns the only value for a single-element sample', () => {
  assert.equal(percentile([42], 50), 42);
  assert.equal(percentile([42], 99), 42);
});

test('percentile interpolates between ranks', () => {
  const samples = [1, 2, 3, 4, 5];
  assert.equal(percentile(samples, 0), 1);
  assert.equal(percentile(samples, 50), 3);
  assert.equal(percentile(samples, 100), 5);
  // rank = 0.95 * 4 = 3.8 -> between index 3 (4) and 4 (5): 4 + 0.8 = 4.8
  assert.ok(Math.abs(percentile(samples, 95) - 4.8) < 1e-9);
});

test('percentile is order-independent (sorts internally)', () => {
  assert.equal(percentile([5, 1, 3, 2, 4], 50), 3);
});

test('average computes the mean and handles the empty case', () => {
  assert.equal(average([2, 4, 6]), 4);
  assert.equal(average([]), 0);
});

test('summarize reports count, min, max, and percentiles', () => {
  const stats = summarize([10, 20, 30, 40, 50]);
  assert.equal(stats.count, 5);
  assert.equal(stats.min, 10);
  assert.equal(stats.max, 50);
  assert.equal(stats.avg, 30);
  assert.equal(stats.p50, 30);
});

test('summarize handles an empty sample without throwing', () => {
  const stats = summarize([]);
  assert.deepEqual(stats, { count: 0, min: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 });
});

test('round trims to the requested number of decimals', () => {
  assert.equal(round(3.14159), 3.14);
  assert.equal(round(3.14159, 3), 3.142);
  assert.equal(round(10), 10);
});
