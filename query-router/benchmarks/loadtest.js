// Mixed read/write load test driven entirely through the Query Router.
//
// It spins up a fixed number of concurrent workers, each firing queries back to
// back until the duration elapses, then reports throughput, latency percentiles,
// the error rate, and how reads were distributed across the replica pool.
//
// Run the seed script first:  node benchmarks/seed.js
// Then:                       node benchmarks/loadtest.js
//
// Tunables (env vars): BENCH_DURATION, BENCH_CONCURRENCY, BENCH_READ_RATIO,
// BENCH_ROUTER_URL. See benchmarks/config.js for defaults.

const { loadBenchConfig } = require('./config');
const { postQuery, authHeaders } = require('./client');
const { summarize, round } = require('./stats');

async function discoverIdRange(routerUrl) {
  let response;
  try {
    response = await fetch(`${routerUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ sql: 'SELECT min(id)::int AS min, max(id)::int AS max FROM bench_items' })
    });
  } catch (error) {
    throw new Error(`Could not reach the router at ${routerUrl}. Is the stack up? (${error.message})`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Could not read bench_items. Did you run "node benchmarks/seed.js"? (HTTP ${response.status} ${text})`);
  }

  const body = await response.json();
  const row = body.rows && body.rows[0];
  if (!row || row.max === null) {
    throw new Error('bench_items is empty. Run "node benchmarks/seed.js" first.');
  }
  return { minId: row.min, maxId: row.max };
}

function randomId(minId, maxId) {
  return Math.floor(minId + Math.random() * (maxId - minId + 1));
}

async function run() {
  const config = loadBenchConfig();
  console.log('--- Replic8 Query Router load test ---');
  console.log(`Target:       ${config.routerUrl}`);
  console.log(`Duration:     ${config.durationSeconds}s`);
  console.log(`Concurrency:  ${config.concurrency}`);
  console.log(`Read ratio:   ${Math.round(config.readRatio * 100)}% reads / ${Math.round((1 - config.readRatio) * 100)}% writes`);
  console.log('');

  const { minId, maxId } = await discoverIdRange(config.routerUrl);
  console.log(`Seeded id range: ${minId}..${maxId}`);
  console.log('Running...');

  const readLatencies = [];
  const writeLatencies = [];
  const poolCounts = new Map();
  let errorCount = 0;
  const errorSamples = [];

  const deadline = Date.now() + config.durationSeconds * 1000;
  const startedAt = Date.now();

  async function worker() {
    while (Date.now() < deadline) {
      const isRead = Math.random() < config.readRatio;
      const result = isRead
        ? await postQuery(config.routerUrl, 'SELECT id, val FROM bench_items WHERE id = $1', [randomId(minId, maxId)])
        : await postQuery(config.routerUrl, 'INSERT INTO bench_items (val) VALUES ($1)', [`bench-${Date.now()}-${Math.random()}`]);

      if (!result.ok) {
        errorCount += 1;
        if (errorSamples.length < 5) {
          errorSamples.push(result.error);
        }
        continue;
      }

      if (isRead) {
        readLatencies.push(result.ms);
      } else {
        writeLatencies.push(result.ms);
      }
      if (result.pool) {
        poolCounts.set(result.pool, (poolCounts.get(result.pool) || 0) + 1);
      }
    }
  }

  await Promise.all(Array.from({ length: config.concurrency }, () => worker()));

  const elapsedSeconds = (Date.now() - startedAt) / 1000;
  const totalSuccess = readLatencies.length + writeLatencies.length;
  const totalRequests = totalSuccess + errorCount;

  const readStats = summarize(readLatencies);
  const writeStats = summarize(writeLatencies);

  function printLatency(label, stats) {
    if (!stats.count) {
      console.log(`  ${label.padEnd(7)} (no successful requests)`);
      return;
    }
    console.log(
      `  ${label.padEnd(7)} count=${String(stats.count).padStart(7)}  ` +
      `avg=${round(stats.avg)}ms  p50=${round(stats.p50)}ms  ` +
      `p95=${round(stats.p95)}ms  p99=${round(stats.p99)}ms  max=${round(stats.max)}ms`
    );
  }

  console.log('');
  console.log('--- Results ---');
  console.log(`Elapsed:           ${round(elapsedSeconds)}s`);
  console.log(`Total requests:    ${totalRequests}`);
  console.log(`Successful:        ${totalSuccess}`);
  console.log(`Errors:            ${errorCount} (${round((errorCount / Math.max(totalRequests, 1)) * 100)}%)`);
  console.log(`Throughput:        ${round(totalSuccess / elapsedSeconds)} req/s`);
  console.log('');
  console.log('Latency:');
  printLatency('READ', readStats);
  printLatency('WRITE', writeStats);
  console.log('');
  console.log('Read distribution across pools:');
  if (poolCounts.size === 0) {
    console.log('  (none)');
  } else {
    for (const [pool, count] of [...poolCounts.entries()].sort((a, b) => b[1] - a[1])) {
      const share = round((count / totalSuccess) * 100);
      console.log(`  ${pool.padEnd(22)} ${String(count).padStart(7)}  (${share}%)`);
    }
  }

  if (errorSamples.length) {
    console.log('');
    console.log('Sample errors:');
    for (const sample of errorSamples) {
      console.log(`  - ${sample}`);
    }
  }
}

run().catch((error) => {
  console.error('[loadtest] Failed:', error.message);
  process.exitCode = 1;
});
