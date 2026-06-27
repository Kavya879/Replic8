const { percentile } = require('../utils/percentile');

// Tracks recent routed-query latencies in a sliding time window so the cluster
// snapshot can report REAL percentiles and throughput instead of placeholders.
//
// - Latency percentiles are computed over `windowMs` of samples.
// - Throughput (requests/sec) is computed over the shorter `rpsWindowMs` so it
//   reacts quickly to load changes.
function createQueryStatsTracker(options = {}) {
  const windowMs = options.windowMs || 60000;
  const rpsWindowMs = options.rpsWindowMs || 5000;
  const maxSamples = options.maxSamples || 50000;

  let samples = []; // ordered by insertion time: { t, ms }

  function prune(now) {
    const cutoff = now - windowMs;
    let firstFresh = 0;
    while (firstFresh < samples.length && samples[firstFresh].t < cutoff) {
      firstFresh += 1;
    }
    if (firstFresh > 0) {
      samples = samples.slice(firstFresh);
    }
    if (samples.length > maxSamples) {
      samples = samples.slice(samples.length - maxSamples);
    }
  }

  function record(latencyMs) {
    if (!Number.isFinite(latencyMs) || latencyMs < 0) {
      return;
    }
    const now = Date.now();
    samples.push({ t: now, ms: latencyMs });
    prune(now);
  }

  function snapshot() {
    const now = Date.now();
    prune(now);

    const values = samples.map((sample) => sample.ms);
    const rpsCutoff = now - rpsWindowMs;
    let recentCount = 0;
    for (const sample of samples) {
      if (sample.t >= rpsCutoff) {
        recentCount += 1;
      }
    }

    return {
      p50LatencyMs: percentile(values, 50),
      p95LatencyMs: percentile(values, 95),
      p99LatencyMs: percentile(values, 99),
      requestsPerSecond: recentCount / (rpsWindowMs / 1000),
      sampleCount: values.length
    };
  }

  return {
    record,
    snapshot
  };
}

module.exports = {
  createQueryStatsTracker
};
