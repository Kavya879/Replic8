const { collectContainerMetrics } = require('./dockerMetrics');
const { calculateReplicaScore } = require('../routing/replicaScorer');

function createReplicaMonitor(replicaPools, config) {
  const state = new Map();
  let timer = null;
  let running = false;

  function getStateSnapshot() {
    return replicaPools.map((replica) => {
      const metrics = state.get(replica.name) || {
        unhealthy: true,
        isStale: true,
        score: Number.POSITIVE_INFINITY
      };

      return {
        name: replica.name,
        pool: replica.pool,
        serviceName: replica.serviceName,
        metrics,
        score: metrics.score ?? Number.POSITIVE_INFINITY
      };
    }).sort((left, right) => left.score - right.score);
  }

  async function refreshReplica(replica) {
    const startedAt = Date.now();
    try {
      const [containerMetrics, connectionResult] = await Promise.all([
        collectContainerMetrics(replica.serviceName),
        replica.pool.query('SELECT count(*)::int AS active_connections FROM pg_stat_activity')
      ]);

      const probeStartedAt = Date.now();
      await replica.pool.query('SELECT 1');
      const probeLatencyMs = Date.now() - probeStartedAt;
      const connectionCount = Number(connectionResult?.rows?.[0]?.active_connections || 0);
      const previous = state.get(replica.name) || {};
      const previousLatency = Number.isFinite(previous.averageLatencyMs) ? previous.averageLatencyMs : probeLatencyMs;
      const averageLatencyMs = previous.averageLatencyMs
        ? (previous.averageLatencyMs * 0.7) + (probeLatencyMs * 0.3)
        : probeLatencyMs;
      const metrics = {
        containerId: containerMetrics.containerId,
        cpuPercent: containerMetrics.cpuPercent,
        memoryPercent: containerMetrics.memoryPercent,
        activeConnections: connectionCount,
        averageLatencyMs,
        isStale: false,
        unhealthy: false,
        lastUpdatedAt: startedAt,
        lastProbeLatencyMs: probeLatencyMs,
        score: 0
      };

      metrics.score = calculateReplicaScore(metrics, {
        weights: config.weights,
        latencyTargetMs: config.latencyTargetMs,
        connectionCap: config.poolMax
      });

      state.set(replica.name, metrics);
    } catch (error) {
      state.set(replica.name, {
        ...(state.get(replica.name) || {}),
        unhealthy: true,
        isStale: true,
        lastError: error.message,
        lastUpdatedAt: startedAt,
        score: Number.POSITIVE_INFINITY
      });
    }
  }

  async function refreshAll() {
    await Promise.all(replicaPools.map(refreshReplica));

    const staleThreshold = config.staleReplicaThresholdMs;
    const now = Date.now();

    for (const replica of replicaPools) {
      const metrics = state.get(replica.name);
      if (!metrics) {
        continue;
      }

      const isStale = now - metrics.lastUpdatedAt > staleThreshold;
      if (isStale) {
        metrics.isStale = true;
        metrics.score = calculateReplicaScore(metrics, {
          weights: config.weights,
          latencyTargetMs: config.latencyTargetMs,
          connectionCap: config.poolMax
        });
        state.set(replica.name, metrics);
      }
    }
  }

  function start() {
    if (running) {
      return;
    }

    running = true;

    const loop = async () => {
      await refreshAll();
      timer = setTimeout(loop, config.monitorIntervalMs);
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
    };

    loop();
  }

  function stop() {
    running = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function updateQueryLatency(replicaName, latencyMs) {
    const current = state.get(replicaName);

    if (!current) {
      return;
    }

    const averageLatencyMs = current.averageLatencyMs
      ? (current.averageLatencyMs * 0.8) + (latencyMs * 0.2)
      : latencyMs;

    const updated = {
      ...current,
      averageLatencyMs,
      lastUpdatedAt: Date.now(),
      isStale: false,
      unhealthy: false
    };

    updated.score = calculateReplicaScore(updated, {
      weights: config.weights,
      latencyTargetMs: config.latencyTargetMs,
      connectionCap: config.poolMax
    });

    state.set(replicaName, updated);
  }

  function markReplicaFailed(replicaName, errorMessage) {
    const current = state.get(replicaName);

    if (!current) {
      return;
    }

    state.set(replicaName, {
      ...current,
      unhealthy: true,
      isStale: true,
      lastError: errorMessage,
      lastUpdatedAt: Date.now(),
      score: Number.POSITIVE_INFINITY
    });
  }

  return {
    start,
    stop,
    refreshAll,
    updateQueryLatency,
    markReplicaFailed,
    getStateSnapshot
  };
}

module.exports = {
  createReplicaMonitor
};