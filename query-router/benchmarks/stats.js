// Small statistics helpers for the benchmark harness. No external dependencies.

// Linear-interpolation percentile over an unsorted sample of numbers.
// p is expressed in the [0, 100] range.
function percentile(samples, p) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return 0;
  }

  const sorted = [...samples].sort((a, b) => a - b);
  if (sorted.length === 1) {
    return sorted[0];
  }

  const rank = (p / 100) * (sorted.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const weight = rank - lowerIndex;

  return sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * weight;
}

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
