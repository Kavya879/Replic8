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
        const latencyMs = Date.now() - startedAt;
        clusterMonitor.updateQueryLatency(primaryNode.name, latencyMs);
        clusterMonitor.recordQuery(latencyMs);
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
        const latencyMs = Date.now() - startedAt;
        clusterMonitor.updateQueryLatency(replica.name, latencyMs);
        clusterMonitor.recordQuery(latencyMs);
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
    const startedAt = Date.now();
    const result = await primaryNode.pool.query(sql, params);
    clusterMonitor.recordQuery(Date.now() - startedAt);
    return {
      poolLabel: primaryNode.name,
      result
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