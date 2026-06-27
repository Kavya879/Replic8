// Small statistics helpers for the benchmark harness. No external dependencies.
// The percentile implementation is shared with the router runtime to keep a
// single source of truth.

const { percentile } = require('../src/utils/percentile');

function average(samples) {
  if (!samples.length) {
    return 0;
  }
  return samples.reduce((total, value) => total + value, 0) / samples.length;
}

// Builds a latency summary (in milliseconds) from a list of samples.
function summarize(samples) {
  return {
    count: samples.length,
    min: samples.length ? Math.min(...samples) : 0,
    avg: average(samples),
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    p99: percentile(samples, 99),
    max: samples.length ? Math.max(...samples) : 0
  };
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

module.exports = {
  percentile,
  average,
  summarize,
  round
};
