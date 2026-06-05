function isRetryableConnectionError(error) {
  return Boolean(error) && (
    error.code === 'ECONNREFUSED' ||
    error.code === 'ETIMEDOUT' ||
    error.code === '57P01' ||
    error.code === '57P02' ||
    error.code === '57P03'
  );
}

function createPoolRouter(clusterMonitor) {
  function orderedReplicas() {
    return clusterMonitor.getRoutingSnapshot();
  }

  async function routeRead(sql, params) {
    const replicas = orderedReplicas();

    if (replicas.length === 0) {
      // Fallback to active primary if all replicas are down
      const primaryNode = clusterMonitor.getPrimaryNode();
      if (primaryNode) {
        const startedAt = Date.now();
        const result = await primaryNode.pool.query(sql, params);
        clusterMonitor.updateQueryLatency(primaryNode.name, Date.now() - startedAt);
        return {
          poolLabel: primaryNode.name,
          result
        };
      }
      throw new Error('No database pools are available.');
    }

    const attempts = replicas.length;
    let lastError = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const replica = replicas[attempt];
      const startedAt = Date.now();

      try {
        const result = await replica.pool.query(sql, params);
        clusterMonitor.updateQueryLatency(replica.name, Date.now() - startedAt);
        clusterMonitor.markReplicaRecovered(replica.name);

        return {
          poolLabel: replica.name,
          result
        };
      } catch (error) {
        lastError = error;
        clusterMonitor.markReplicaFailed(replica.name, error.message);
        if (!isRetryableConnectionError(error)) {
          throw error;
        }
      }
    }

    throw lastError || new Error('Failed to execute the read query on any replica.');
  }

  async function routeWrite(sql, params) {
    const primaryNode = clusterMonitor.getPrimaryNode();
    if (!primaryNode) {
      throw new Error('No active primary database available.');
    }
    return {
      poolLabel: primaryNode.name,
      result: await primaryNode.pool.query(sql, params)
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