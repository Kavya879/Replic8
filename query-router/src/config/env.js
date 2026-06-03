require('dotenv').config();

function parseList(value) {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function loadConfig() {
  return {
    port: toNumber(process.env.PORT, 3000),
    poolMax: toNumber(process.env.POOL_MAX, 10),
    poolConnectionTimeoutMs: toNumber(process.env.POOL_CONNECTION_TIMEOUT_MS, 5000),
    primary: {
      host: process.env.PRIMARY_DB_HOST || 'postgres-primary',
      port: toNumber(process.env.PRIMARY_DB_PORT, 5432),
      database: process.env.PRIMARY_DB_NAME || 'appdb',
      user: process.env.PRIMARY_DB_USER || 'postgres',
      password: process.env.PRIMARY_DB_PASSWORD || 'change-me-primary-password'
    },
    replicas: {
      hosts: parseList(process.env.REPLICA_DB_HOSTS || 'postgres-replica-1,postgres-replica-2'),
      port: toNumber(process.env.REPLICA_DB_PORT, 5432),
      database: process.env.REPLICA_DB_NAME || 'appdb',
      user: process.env.REPLICA_DB_USER || 'postgres',
      password: process.env.REPLICA_DB_PASSWORD || 'change-me-primary-password'
    }
  };
}

module.exports = {
  loadConfig
};