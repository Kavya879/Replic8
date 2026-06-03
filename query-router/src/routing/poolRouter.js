function isRetryableConnectionError(error) {
  return Boolean(error) && (
    error.code === 'ECONNREFUSED' ||
    error.code === 'ETIMEDOUT' ||
    error.code === '57P01' ||
    error.code === '57P02' ||
    error.code === '57P03'
  );
}

function createPoolRouter(primaryPool, replicaPools) {
  let replicaIndex = 0;

  function nextReplicaPool() {
    if (replicaPools.length === 0) {
      return null;
    }

    const pool = replicaPools[replicaIndex % replicaPools.length];
    replicaIndex = (replicaIndex + 1) % replicaPools.length;
    return pool;
  }

  async function routeRead(sql, params) {
    if (replicaPools.length === 0) {
      throw new Error('No replica pools are configured.');
    }

    const attempts = replicaPools.length;
    let lastError = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const pool = nextReplicaPool();

      try {
        return {
          poolLabel: `replica-${attempt + 1}`,
          result: await pool.query(sql, params)
        };
      } catch (error) {
        lastError = error;
        if (!isRetryableConnectionError(error)) {
          throw error;
        }
      }
    }

    throw lastError || new Error('Failed to execute the read query on any replica.');
  }

  async function routeWrite(sql, params) {
    return {
      poolLabel: 'primary',
      result: await primaryPool.query(sql, params)
    };
  }

  return {
    routeRead,
    routeWrite
  };
}

module.exports = {
  createPoolRouter
};