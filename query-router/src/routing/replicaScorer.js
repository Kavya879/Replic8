function clamp01(value) {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value > 1 ? 1 : value;
}

function calculateReplicaScore(metrics, config) {
  if (!metrics || metrics.unhealthy) {
    return Number.POSITIVE_INFINITY;
  }

  const cpuPressure = clamp01((metrics.cpuPercent || 0) / 100);
  const memoryPressure = clamp01((metrics.memoryPercent || 0) / 100);
  const connectionCap = Math.max(config.connectionCap || 1, 1);
  const connectionPressure = clamp01((metrics.activeConnections || 0) / connectionCap);
  const latencyPressure = clamp01((metrics.averageLatencyMs || 0) / Math.max(config.latencyTargetMs || 1, 1));
  const freshnessPenalty = metrics.isStale ? 0.5 : 0;

  return (
    config.weights.cpu * cpuPressure +
    config.weights.memory * memoryPressure +
    config.weights.connections * connectionPressure +
    config.weights.latency * latencyPressure +
    freshnessPenalty
  );
}

module.exports = {
  calculateReplicaScore,
  clamp01
};