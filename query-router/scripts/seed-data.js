// Seeds a demo `users` table on the primary so a freshly cloned stack has data
// to query immediately (the README's example SELECT/INSERT statements target it).
//
// Connects DIRECTLY to the primary because CREATE TABLE is DDL, which the router
// does not route. Reuses the benchmark connection config (host 127.0.0.1:15432
// by default; override with BENCH_PRIMARY_HOST / BENCH_PRIMARY_PORT / BENCH_DB_*).
//
// Usage:  npm run seed:data

const { Pool } = require('pg');
const { loadBenchConfig } = require('../benchmarks/config');

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

const SAMPLE_USERS = [
  ['Alice Johnson', 'alice@example.com'],
  ['Bob Smith', 'bob@example.com'],
  ['Carlos Diaz', 'carlos@example.com'],
  ['Dana Lee', 'dana@example.com'],
  ['Erin Patel', 'erin@example.com']
];

async function seed() {
  const config = loadBenchConfig();
  const pool = new Pool({
    host: config.primary.host,
    port: config.primary.port,
    database: config.primary.database,
    user: config.primary.user,
    password: config.primary.password,
    max: 4,
    connectionTimeoutMillis: 5000
  });

  try {
    console.log(`[seed:data] Connecting to primary at ${config.primary.host}:${config.primary.port}...`);
    await pool.query(CREATE_TABLE_SQL);

    const placeholders = SAMPLE_USERS.map((_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(', ');
    const values = SAMPLE_USERS.flat();
    await pool.query(
      `INSERT INTO users (name, email) VALUES ${placeholders} ON CONFLICT (email) DO NOTHING`,
      values
    );

    const { rows } = await pool.query('SELECT count(*)::int AS count FROM users');
    console.log(`[seed:data] Done. users table now has ${rows[0].count} rows.`);
    console.log('[seed:data] Try it through the router:');
    console.log('  curl -X POST http://localhost:3002/query -H "Content-Type: application/json" -d "{\\"sql\\": \\"SELECT * FROM users\\"}"');
  } finally {
    await pool.end();
  }
}

seed().catch((error) => {
  console.error('[seed:data] Failed:', error.message);
  process.exitCode = 1;
});
