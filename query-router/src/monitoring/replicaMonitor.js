const { collectContainerMetrics, promoteContainer } = require('./dockerMetrics');
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

function createReplicaMonitor(allNodes, config) {
  const state = new Map();
  const listeners = new Set();
  let timer = null;
  let running = false;

  // Variables for alert tracking
  const alerts = [];
  function addAlert(message, type = 'info') {
    alerts.unshift({
      timestamp: new Date().toISOString(),
      message,
      type
    });
    if (alerts.length > 50) {
      alerts.pop();
    }
    console.log(`[Alert] [${type.toUpperCase()}] ${message}`);
  }

  let primaryDownAlerted = false;
  let lastActivePrimaryName = null;
  const startupTime = Date.now();
  const gracePeriodMs = 15000;

  function getNodes() {
    return allNodes.map((node) => {
      const metrics = state.get(node.name) || {
        status: NODE_STATUS.DOWN,
        unhealthy: true,
        isStale: true,
        score: Number.POSITIVE_INFINITY,
        failureCount: 0,
        inRecovery: node.isConfiguredPrimary ? false : true,
        role: node.isConfiguredPrimary ? 'Primary' : 'Replica'
      };

      return {
        name: node.name,
        serviceName: node.serviceName,
        status: metrics.status || deriveStatus(metrics, config),
        role: metrics.role || (metrics.inRecovery ? 'Replica' : 'Primary'),
        metrics,
        score: metrics.score ?? Number.POSITIVE_INFINITY,
        pool: node.pool
      };
    });
  }

  function getPrimaryNode() {
    const nodes = getNodes();
    return nodes.find(node => node.role === 'Primary' && node.status !== NODE_STATUS.DOWN);
  }

  function getRoutingSnapshot() {
    return getNodes()
      .filter(node => node.role === 'Replica' && node.status !== NODE_STATUS.DOWN)
      .sort((left, right) => {
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
    return getNodes().map(node => {
      const { pool, ...rest } = node;
      return rest;
    });
  }

  function getClusterSnapshot() {
    const replicas = getStateSnapshot();
    const activeNodes = replicas.filter((node) => node.status !== NODE_STATUS.DOWN);
    const activeReplicas = replicas.filter((node) => node.role === 'Replica' && node.status !== NODE_STATUS.DOWN);

    return {
      timestamp: new Date().toISOString(),
      replicas,
      alerts,
      system: {
        cpuPercent: activeNodes.length ? activeNodes.reduce((total, node) => total + Number(node.metrics.cpuPercent || 0), 0) / activeNodes.length : 0,
        memoryPercent: activeNodes.length ? activeNodes.reduce((total, node) => total + Number(node.metrics.memoryPercent || 0), 0) / activeNodes.length : 0,
        connectionCount: activeNodes.reduce((total, node) => total + Number(node.metrics.activeConnections || 0), 0),
        replicationLagMs: activeReplicas.length ? Math.max(...activeReplicas.map((node) => Number(node.metrics.lastProbeLatencyMs || 0))) : 0
      },
      queries: {
        p50LatencyMs: activeReplicas.length ? activeReplicas.reduce((total, node) => total + Number(node.metrics.averageLatencyMs || 0), 0) / activeReplicas.length : 0,
        p95LatencyMs: activeReplicas.length ? Math.max(...activeReplicas.map((node) => Number(node.metrics.averageLatencyMs || 0))) : 0,
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

  async function refreshNode(node) {
    const startedAt = Date.now();
    let containerMetrics = { cpuPercent: 0, memoryPercent: 0 };
    try {
      try {
        containerMetrics = await collectContainerMetrics(node.serviceName);
      } catch (metricsError) {
        console.warn(`[Monitor] Failed to collect container metrics for ${node.name}: ${metricsError.message}`);
      }

      const dbInfo = await node.pool.query('SELECT (SELECT count(*)::int FROM pg_stat_activity) AS active_connections, pg_is_in_recovery() AS in_recovery');

      const probeStartedAt = Date.now();
      await node.pool.query('SELECT 1');
      const probeLatencyMs = Date.now() - probeStartedAt;

      const connectionCount = Number(dbInfo?.rows?.[0]?.active_connections || 0);
      const inRecovery = Boolean(dbInfo?.rows?.[0]?.in_recovery);

      const previous = state.get(node.name) || {};
      const averageLatencyMs = previous.averageLatencyMs
        ? (previous.averageLatencyMs * 0.7) + (probeLatencyMs * 0.3)
        : probeLatencyMs;

      const metrics = {
        containerId: containerMetrics.containerId || null,
        cpuPercent: containerMetrics.cpuPercent || 0,
        memoryPercent: containerMetrics.memoryPercent || 0,
        activeConnections: connectionCount,
        averageLatencyMs,
        isStale: false,
        unhealthy: false,
        failureCount: 0,
        lastUpdatedAt: startedAt,
        lastProbeLatencyMs: probeLatencyMs,
        inRecovery,
        role: inRecovery ? 'Replica' : 'Primary',
        score: 0
      };

      if (inRecovery) {
        metrics.score = calculateReplicaScore(metrics, {
          weights: config.weights,
          latencyTargetMs: config.latencyTargetMs,
          connectionCap: config.poolMax
        });
      } else {
        metrics.score = Number.POSITIVE_INFINITY;
      }

      metrics.status = deriveStatus(metrics, config);
      state.set(node.name, metrics);
    } catch (error) {
      const previous = state.get(node.name) || {};
      const inRecovery = previous.inRecovery ?? (node.isConfiguredPrimary ? false : true);

      state.set(node.name, {
        ...previous,
        unhealthy: true,
        isStale: true,
        failureCount: Number(previous.failureCount || 0) + 1,
        lastError: error.message,
        lastUpdatedAt: startedAt,
        status: NODE_STATUS.DOWN,
        score: Number.POSITIVE_INFINITY,
        cpuPercent: 0,
        memoryPercent: 0,
        activeConnections: 0,
        averageLatencyMs: 0,
        inRecovery,
        role: previous.role || (inRecovery ? 'Replica' : 'Primary')
      });
    }
  }

  async function refreshAll() {
    await Promise.all(allNodes.map(refreshNode));

    const staleThreshold = config.staleReplicaThresholdMs;
    const now = Date.now();

    for (const node of allNodes) {
      const metrics = state.get(node.name);
      if (!metrics) {
        continue;
      }

      const isStale = now - metrics.lastUpdatedAt > staleThreshold;
      if (isStale) {
        metrics.isStale = true;
        if (metrics.inRecovery) {
          metrics.score = calculateReplicaScore(metrics, {
            weights: config.weights,
            latencyTargetMs: config.latencyTargetMs,
            connectionCap: config.poolMax
          });
        }
        metrics.status = deriveStatus(metrics, config);
        state.set(node.name, metrics);
      }
    }

    // Dynamic failover detection
    const onlineNodes = getNodes().filter(node => node.status !== NODE_STATUS.DOWN);
    const primaryNode = onlineNodes.find(node => node.role === 'Primary');

    if (!primaryNode) {
      // Step 1: Detect primary failure
      if (!primaryDownAlerted) {
        addAlert('Primary Down', 'error');
        primaryDownAlerted = true;

        const allNodesSnapshot = getNodes();
        const formerPrimary = allNodesSnapshot.find(node => node.role === 'Primary' && node.status === NODE_STATUS.DOWN);
        if (formerPrimary) {
          lastActivePrimaryName = formerPrimary.name;
        }
      }

      // Step 2: Promote healthiest replica
      if (Date.now() - startupTime > gracePeriodMs) {
        const onlineReplicas = onlineNodes.filter(node => node.role === 'Replica');
        if (onlineReplicas.length > 0) {
          onlineReplicas.sort((a, b) => {
            const rank = { [NODE_STATUS.HEALTHY]: 0, [NODE_STATUS.WARNING]: 1 };
            const aRank = rank[a.status] ?? 1;
            const bRank = rank[b.status] ?? 1;
            if (aRank !== bRank) return aRank - bRank;
            return (a.score ?? Number.POSITIVE_INFINITY) - (b.score ?? Number.POSITIVE_INFINITY);
          });

          const replicaToPromote = onlineReplicas[0];
          try {
            console.log(`[Failover] Promoting healthiest replica: ${replicaToPromote.name}`);
            await replicaToPromote.pool.query({
              text: 'SELECT pg_promote(false)',
              query_timeout: 30000
            });

            const displayName = replicaToPromote.name.replace('postgres-', '').replace('-', ' ');
            const capitalizedDisplayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
            addAlert(`${capitalizedDisplayName} Promoted`, 'info');

            const currentMetrics = state.get(replicaToPromote.name);
            if (currentMetrics) {
              currentMetrics.inRecovery = false;
              currentMetrics.role = 'Primary';
              currentMetrics.score = Number.POSITIVE_INFINITY;
              state.set(replicaToPromote.name, currentMetrics);
            }
          } catch (promoteError) {
            console.error(`[Failover] Failed to promote replica ${replicaToPromote.name}:`, promoteError);
          }
        } else {
          console.error('[Failover] No online replicas available for promotion.');
        }
      } else {
        console.log(`[Failover] Primary is unreachable, but holding failover promotion during startup grace period...`);
      }
    } else {
      if (lastActivePrimaryName) {
        const formerPrimaryNode = getNodes().find(node => node.name === lastActivePrimaryName);
        if (formerPrimaryNode && formerPrimaryNode.status !== NODE_STATUS.DOWN) {
          addAlert('Primary Restored', 'success');
          if (formerPrimaryNode.role === 'Replica') {
            addAlert('Rejoining Cluster As Replica', 'info');
          }
          lastActivePrimaryName = null;
          primaryDownAlerted = false;
        }
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

    if (updated.inRecovery) {
      updated.score = calculateReplicaScore(updated, {
        weights: config.weights,
        latencyTargetMs: config.latencyTargetMs,
        connectionCap: config.poolMax
      });
    } else {
      updated.score = Number.POSITIVE_INFINITY;
    }
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
      score: Number.POSITIVE_INFINITY,
      cpuPercent: 0,
      memoryPercent: 0,
      activeConnections: 0,
      averageLatencyMs: 0
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
    if (updated.inRecovery) {
      updated.score = calculateReplicaScore(updated, {
        weights: config.weights,
        latencyTargetMs: config.latencyTargetMs,
        connectionCap: config.poolMax
      });
    } else {
      updated.score = Number.POSITIVE_INFINITY;
    }

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
    getClusterSnapshot,
    getPrimaryNode
  };
}

module.exports = {
  createReplicaMonitor
};