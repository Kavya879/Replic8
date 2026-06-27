// Failover timing probe.
//
// Fires a steady stream of READ queries at the router and records exactly when
// requests start failing and when they recover. While this is running, take a
// node down in another terminal, e.g.:
//
//   docker compose stop postgres-replica-2     # replica failover
//   docker compose stop postgres-primary       # primary failover + promotion
//
// The script reports the observed unavailability window (time between the first
// failed request and the first subsequent success), which is a real, measured
// proxy for "how long did clients see errors".
//
// Usage:  node benchmarks/failover.js
// Tunables: BENCH_DURATION (default 60s), BENCH_ROUTER_URL, BENCH_PROBE_INTERVAL_MS (default 100)

const { loadBenchConfig } = require('./config');
const { postQuery } = require('./client');
const { round } = require('./stats');

function nowIso() {
  return new Date().toISOString();
}

async function run() {
  const config = loadBenchConfig();
  const probeIntervalMs = Number(process.env.BENCH_PROBE_INTERVAL_MS) || 100;
  const durationSeconds = Number(process.env.BENCH_DURATION) || 60;

  console.log('--- Replic8 failover probe ---');
  console.log(`Target:   ${config.routerUrl}`);
  console.log(`Duration: ${durationSeconds}s   probe every ${probeIntervalMs}ms`);
  console.log('Take a node down in another terminal while this runs.');
  console.log('  e.g. docker compose stop postgres-replica-2');
  console.log('');

  const deadline = Date.now() + durationSeconds * 1000;
  let total = 0;
  let failures = 0;
  let currentlyDown = false;
  let outageStartedAt = null;
  const outages = [];

  while (Date.now() < deadline) {
    const tickStart = Date.now();
    const result = await postQuery(config.routerUrl, 'SELECT 1 AS ping');
    total += 1;

    if (!result.ok) {
      failures += 1;
      if (!currentlyDown) {
        currentlyDown = true;
        outageStartedAt = Date.now();
        console.log(`[${nowIso()}] ⚠️  requests started failing (${result.error})`);
      }
    } else if (currentlyDown) {
      const downMs = Date.now() - outageStartedAt;
      outages.push(downMs);
      currentlyDown = false;
      console.log(`[${nowIso()}] ✅ recovered after ~${round(downMs)}ms (served by ${result.pool})`);
    }

    const elapsed = Date.now() - tickStart;
    if (elapsed < probeIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, probeIntervalMs - elapsed));
    }
  }

  console.log('');
  console.log('--- Summary ---');
  console.log(`Total probes:   ${total}`);
  console.log(`Failed probes:  ${failures} (${round((failures / Math.max(total, 1)) * 100)}%)`);
  if (outages.length) {
    console.log(`Outages observed: ${outages.length}`);
    outages.forEach((ms, index) => console.log(`  #${index + 1}: ~${round(ms)}ms of failing reads`));
  } else if (currentlyDown) {
    console.log('A node went down but did not recover before the probe ended. Increase BENCH_DURATION.');
  } else {
    console.log('No outage was observed. Did you take a node down during the run?');
  }
}

run().catch((error) => {
  console.error('[failover] Failed:', error.message);
  process.exitCode = 1;
});
