const prometheusBaseUrl = process.env.NEXT_PUBLIC_PROMETHEUS_URL || 'http://localhost:9090';

async function queryPrometheus(query) {
  const response = await fetch(`${prometheusBaseUrl}/api/v1/query?query=${encodeURIComponent(query)}`, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`Prometheus request failed with status ${response.status}`);
  }

  return response.json();
}

export async function loadRealtimeMetricsSnapshot() {
  const [cpuResult, memoryResult, connectionResult, lagResult, latencyResult, replicaScoreResult] = await Promise.all([
    queryPrometheus('avg(node_cpu_seconds_total{mode!="idle"}) * 100'),
    queryPrometheus('100 - (avg(node_memory_MemAvailable_bytes) / avg(node_memory_MemTotal_bytes) * 100)'),
    queryPrometheus('sum(pg_stat_activity_count)'),
    queryPrometheus('max(pg_last_xact_replay_timestamp_seconds) - max(pg_last_xact_replay_timestamp_seconds offset 5m)'),
    queryPrometheus('histogram_quantile(0.5, sum(rate(query_router_query_latency_seconds_bucket[5m])) by (le)) * 1000'),
    queryPrometheus('query_router_replica_score')
  ]);

  void connectionResult;
  void lagResult;
  void latencyResult;
  void replicaScoreResult;

  return {
    timestamp: new Date().toISOString(),
    replicas: [],
    system: {
      cpuPercent: Number(cpuResult.data?.result?.[0]?.value?.[1] || 0),
      memoryPercent: Number(memoryResult.data?.result?.[0]?.value?.[1] || 0),
      connectionCount: 0,
      replicationLagMs: 0
    },
    queries: {
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      requestsPerSecond: 0
    }
  };
}