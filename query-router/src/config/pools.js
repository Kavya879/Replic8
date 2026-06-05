const { Pool } = require('pg');

function createPool({ host, port, database, user, password, max, connectionTimeoutMillis, queryTimeoutMillis, applicationName }) {
  const pool = new Pool({
    host,
    port,
    database,
    user,
    password,
    max,
    connectionTimeoutMillis,
    query_timeout: queryTimeoutMillis || 2000,
    idleTimeoutMillis: 30000,
    application_name: applicationName
  });

  // Prevent process crash on idle client errors
  pool.on('error', (err) => {
    console.error(`[Pool Error] [${applicationName}] Unexpected error on idle client:`, err.message);
  });

  return pool;
}

function createPools(config) {
  const primaryPool = createPool({
    ...config.primary,
    max: config.poolMax,
    connectionTimeoutMillis: config.poolConnectionTimeoutMs,
    queryTimeoutMillis: 2000,
    applicationName: 'query-router-primary'
  });

  const replicaPools = config.replicas.hosts.map((host, index) => createPool({
    serviceName: host,
    host,
    port: config.replicas.port,
    database: config.replicas.database,
    user: config.replicas.user,
    password: config.replicas.password,
    max: config.poolMax,
    connectionTimeoutMillis: config.poolConnectionTimeoutMs,
    queryTimeoutMillis: 2000,
    applicationName: `query-router-replica-${index + 1}`
  })).map((pool, index) => ({
    name: config.replicas.hosts[index],
    pool,
    serviceName: config.replicas.hosts[index]
  }));

  return {
    primaryPool,
    replicaPools
  };
}

module.exports = {
  createPools
};