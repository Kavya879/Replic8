// Shared configuration for the benchmark scripts.
//
// Defaults assume you are running the benchmarks from your HOST machine against
// the Docker Compose stack, using the published host ports from docker-compose.yml:
//   - query-router  -> http://localhost:3002
//   - postgres-primary -> 127.0.0.1:15432
//
// Every value can be overridden with an environment variable so the same scripts
// work from inside the cluster network or against a remote deployment.

const path = require('path');
// Load the repository-root .env so these host-run scripts pick up the same
// database credentials Docker Compose uses (POSTGRES_USER/PASSWORD/DB).
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function loadBenchConfig() {
  return {
    routerUrl: process.env.BENCH_ROUTER_URL || 'http://localhost:3002',
    durationSeconds: toNumber(process.env.BENCH_DURATION, 15),
    concurrency: toNumber(process.env.BENCH_CONCURRENCY, 20),
    readRatio: Math.min(Math.max(toNumber(process.env.BENCH_READ_RATIO, 0.9), 0), 1),
    seedRows: toNumber(process.env.BENCH_SEED_ROWS, 1000),
    // Direct primary connection, used only for one-time schema setup / seeding.
    primary: {
      host: process.env.BENCH_PRIMARY_HOST || '127.0.0.1',
      port: toNumber(process.env.BENCH_PRIMARY_PORT, 15432),
      database: process.env.BENCH_DB_NAME || process.env.POSTGRES_DB || 'appdb',
      user: process.env.BENCH_DB_USER || process.env.POSTGRES_USER || 'postgres',
      password: process.env.BENCH_DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'change-me-primary-password'
    }
  };
}

module.exports = {
  loadBenchConfig
};
