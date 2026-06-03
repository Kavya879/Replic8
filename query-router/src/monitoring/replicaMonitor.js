const { collectContainerMetrics } = require('./dockerMetrics');
const { calculateReplicaScore } = require('../routing/replicaScorer');

const NODE_STATUS = {
  HEALTHY: 'Healthy',
  WARNING: 'Warning',
  DOWN: 'Down'
};

function deriveStatus(metrics, config) {
  if (!metrics || metrics.status === NODE_STATUS.DOWN || metrics.unhealthy) {
    return NODE_STATUS.DOWN;
  }

  const cpuPercent = Number(metrics.cpuPercent || 0);
  const memoryPercent = Number(metrics.memoryPercent || 0);
  const activeConnections = Number(metrics.activeConnections || 0);
  const averageLatencyMs = Number(metrics.averageLatencyMs || 0);
  const connectionCap = Math.max(config.poolMax || 1, 1);
  const latencyTargetMs = Math.max(config.latencyTargetMs || 1, 1);

  if (metrics.failureCount > 0 || metrics.lastError) {
    return NODE_STATUS.DOWN;
  }

  if (
    metrics.isStale ||
    cpuPercent >= 75 ||
    memoryPercent >= 80 ||
    activeConnections >= connectionCap * 0.8 ||
    averageLatencyMs >= latencyTargetMs * 1.5
  ) {
    return NODE_STATUS.WARNING;
  }

  return NODE_STATUS.HEALTHY;
}

function createReplicaMonitor(replicaPools, config) {
  const state = new Map();
  const listeners = new Set();
  let timer = null;
  let running = false;

  function getReplicas() {
    return replicaPools.map((replica) => {
      const metrics = state.get(replica.name) || {
        status: NODE_STATUS.DOWN,
        unhealthy: true,
        isStale: true,
        score: Number.POSITIVE_INFINITY,
        failureCount: 0
      };

      return {
        name: replica.name,
        pool: replica.pool,
        serviceName: replica.serviceName,
        status: metrics.status || deriveStatus(metrics, config),
        metrics,
        score: metrics.score ?? Number.POSITIVE_INFINITY
      };
    }).sort((left, right) => {
      const rank = { [NODE_STATUS.HEALTHY]: 0, [NODE_STATUS.WARNING]: 1, [NODE_STATUS.DOWN]: 2 };
      const leftRank = rank[left.status] ?? 2;
      const rightRank = rank[right.status] ?? 2;

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return (left.score ?? Number.POSITIVE_INFINITY) - (right.score ?? Number.POSITIVE_INFINITY);
    });
  }

  function getStateSnapshot() {
    return getReplicas();
  }

  function getRoutingSnapshot() {
    return getReplicas().filter((replica) => replica.status !== NODE_STATUS.DOWN);
  }

  function getClusterSnapshot() {
    const replicas = getReplicas();

    return {
      timestamp: new Date().toISOString(),
      replicas,
      system: {
        cpuPercent: replicas.length ? replicas.reduce((total, replica) => total + Number(replica.metrics.cpuPercent || 0), 0) / replicas.length : 0,
        memoryPercent: replicas.length ? replicas.reduce((total, replica) => total + Number(replica.metrics.memoryPercent || 0), 0) / replicas.length : 0,
        connectionCount: replicas.reduce((total, replica) => total + Number(replica.metrics.activeConnections || 0), 0),
        replicationLagMs: replicas.length ? Math.max(...replicas.map((replica) => Number(replica.metrics.lastProbeLatencyMs || 0))) : 0
      },
      queries: {
        p50LatencyMs: replicas.length ? replicas.reduce((total, replica) => total + Number(replica.metrics.averageLatencyMs || 0), 0) / replicas.length : 0,
        p95LatencyMs: replicas.length ? Math.max(...replicas.map((replica) => Number(replica.metrics.averageLatencyMs || 0))) : 0,
        requestsPerSecond: 0
      }
    };
  }

  function emitChange(reason) {
    const payload = {
      reason,
      ...getClusterSnapshot()
    };

    for (const listener of listeners) {
      listener(payload);
    }
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
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
        failureCount: 0,
        lastUpdatedAt: startedAt,
        lastProbeLatencyMs: probeLatencyMs,
        score: 0
      };

      metrics.score = calculateReplicaScore(metrics, {
        weights: config.weights,
        latencyTargetMs: config.latencyTargetMs,
        connectionCap: config.poolMax
      });

      metrics.status = deriveStatus(metrics, config);

      state.set(replica.name, metrics);
    } catch (error) {
      const previous = state.get(replica.name) || {};
      state.set(replica.name, {
        ...(state.get(replica.name) || {}),
        unhealthy: true,
        isStale: true,
        failureCount: Number(previous.failureCount || 0) + 1,
        lastError: error.message,
        lastUpdatedAt: startedAt,
        status: NODE_STATUS.DOWN,
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
        metrics.status = deriveStatus(metrics, config);
        state.set(replica.name, metrics);
      }
    }

    emitChange('refresh');
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
      unhealthy: false,
      failureCount: 0
    };

    updated.score = calculateReplicaScore(updated, {
      weights: config.weights,
      latencyTargetMs: config.latencyTargetMs,
      connectionCap: config.poolMax
    });
    updated.status = deriveStatus(updated, config);

    state.set(replicaName, updated);
    emitChange('latency-update');
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
      failureCount: Number(current.failureCount || 0) + 1,
      lastError: errorMessage,
      lastUpdatedAt: Date.now(),
      status: NODE_STATUS.DOWN,
      score: Number.POSITIVE_INFINITY
    });

    emitChange('replica-down');
  }

  function markReplicaRecovered(replicaName) {
    const current = state.get(replicaName);

    if (!current) {
      return;
    }

    const updated = {
      ...current,
      unhealthy: false,
      isStale: false,
      failureCount: 0,
      lastError: null
    };

    updated.status = deriveStatus(updated, config);
    updated.score = calculateReplicaScore(updated, {
      weights: config.weights,
      latencyTargetMs: config.latencyTargetMs,
      connectionCap: config.poolMax
    });

    state.set(replicaName, updated);
    emitChange('replica-recovered');
  }

  return {
    start,
    stop,
    refreshAll,
    updateQueryLatency,
    markReplicaFailed,
    markReplicaRecovered,
    subscribe,
    getStateSnapshot,
    getRoutingSnapshot,
    getClusterSnapshot
  };
}

module.exports = {
  createReplicaMonitor
};