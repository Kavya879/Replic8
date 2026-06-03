function isRetryableConnectionError(error) {
  return Boolean(error) && (
    error.code === 'ECONNREFUSED' ||
    error.code === 'ETIMEDOUT' ||
    error.code === '57P01' ||
    error.code === '57P02' ||
    error.code === '57P03'
  );
}

function createPoolRouter(primaryPool, replicaMonitor) {
  function orderedReplicas() {
    return replicaMonitor.getStateSnapshot();
  }

  async function routeRead(sql, params) {
    const replicas = orderedReplicas();

    if (replicas.length === 0) {
      throw new Error('No replica pools are configured.');
    }

    const attempts = replicas.length;
    let lastError = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const replica = replicas[attempt];
      const startedAt = Date.now();

      try {
        const result = await replica.pool.query(sql, params);
        replicaMonitor.updateQueryLatency(replica.name, Date.now() - startedAt);

        return {
          poolLabel: replica.name,
          result
        };
      } catch (error) {
        lastError = error;
        replicaMonitor.markReplicaFailed(replica.name, error.message);
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