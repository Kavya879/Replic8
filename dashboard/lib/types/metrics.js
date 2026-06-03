export const METRICS_MODEL = {
  timePoint: ['timestamp', 'value'],
  replicaSnapshot: ['name', 'score', 'cpuPercent', 'memoryPercent', 'activeConnections', 'averageLatencyMs', 'unhealthy', 'stale'],
  realtimeMetricsPayload: ['timestamp', 'replicas', 'system', 'queries']
};