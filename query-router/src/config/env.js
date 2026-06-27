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
    apiKey: (process.env.API_KEY || '').trim(),
    poolMax: toNumber(process.env.POOL_MAX, 10),
    poolConnectionTimeoutMs: toNumber(process.env.POOL_CONNECTION_TIMEOUT_MS, 5000),
    monitorIntervalMs: toNumber(process.env.MONITOR_INTERVAL_MS, 5000),
    staleReplicaThresholdMs: toNumber(process.env.STALE_REPLICA_THRESHOLD_MS, 15000),
    latencyTargetMs: toNumber(process.env.LATENCY_TARGET_MS, 200),
    weights: {
      cpu: toNumber(process.env.CPU_WEIGHT, 0.3),
      memory: toNumber(process.env.MEMORY_WEIGHT, 0.25),
      connections: toNumber(process.env.CONNECTION_WEIGHT, 0.2),
      latency: toNumber(process.env.LATENCY_WEIGHT, 0.25)
    },
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