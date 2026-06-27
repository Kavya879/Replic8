// One-time benchmark schema setup + seeding.
//
// Connects DIRECTLY to the primary (not through the router) because table
// creation is DDL, which the router intentionally does not route. The actual
// benchmark workload (SELECT / INSERT) still goes through the router.
//
// Usage:  node benchmarks/seed.js

const { Pool } = require('pg');
const { loadBenchConfig } = require('./config');

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS bench_items (
    id         SERIAL PRIMARY KEY,
    val        TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

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
    console.log(`[seed] Connecting to primary at ${config.primary.host}:${config.primary.port}...`);
    await pool.query(CREATE_TABLE_SQL);

    const { rows } = await pool.query('SELECT count(*)::int AS count FROM bench_items');
    const existing = rows[0].count;

    if (existing >= config.seedRows) {
      console.log(`[seed] bench_items already has ${existing} rows (target ${config.seedRows}). Nothing to do.`);
      return;
    }

    const toInsert = config.seedRows - existing;
    console.log(`[seed] Inserting ${toInsert} rows...`);

    const batchSize = 500;
    for (let inserted = 0; inserted < toInsert; inserted += batchSize) {
      const batch = Math.min(batchSize, toInsert - inserted);
      const values = [];
      const placeholders = [];
      for (let i = 0; i < batch; i += 1) {
        placeholders.push(`($${i + 1})`);
        values.push(`seed-${inserted + i}-${Math.random().toString(36).slice(2, 10)}`);
      }
      await pool.query(`INSERT INTO bench_items (val) VALUES ${placeholders.join(', ')}`, values);
    }

    console.log(`[seed] Done. bench_items now has ${config.seedRows} rows.`);
  } finally {
    await pool.end();
  }
}

seed().catch((error) => {
  console.error('[seed] Failed:', error.message);
  process.exitCode = 1;
});
