const express = require('express');
const client = require('prom-client');
const { createQueryRoutes } = require('./routes/queryRoutes');
const { errorHandler } = require('./middleware/errorHandler');

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

const queryLatencyHistogram = new client.Histogram({
  name: 'query_router_query_latency_seconds',
  help: 'Latency of SQL queries routed by Query Router',
  labelNames: ['statement_type', 'route', 'pool'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
  registers: [registry]
});

const routedQueriesCounter = new client.Counter({
  name: 'query_router_queries_total',
  help: 'Total SQL queries routed by Query Router',
  labelNames: ['statement_type', 'route', 'pool'],
  registers: [registry]
});

const replicaScoreGauge = new client.Gauge({
  name: 'query_router_replica_score',
  help: 'Computed score for each replica where lower is better',
  labelNames: ['replica'],
  registers: [registry]
});

const replicaCpuGauge = new client.Gauge({
  name: 'query_router_replica_cpu_percent',
  help: 'Replica CPU utilization as measured by the monitor',
  labelNames: ['replica'],
  registers: [registry]
});

const replicaMemoryGauge = new client.Gauge({
  name: 'query_router_replica_memory_percent',
  help: 'Replica memory utilization as measured by the monitor',
  labelNames: ['replica'],
  registers: [registry]
});

const replicaConnectionsGauge = new client.Gauge({
  name: 'query_router_replica_active_connections',
  help: 'Current active PostgreSQL connections per replica',
  labelNames: ['replica'],
  registers: [registry]
});

const replicaLatencyGauge = new client.Gauge({
  name: 'query_router_replica_average_latency_seconds',
  help: 'Average replica query latency measured by Query Router',
  labelNames: ['replica'],
  registers: [registry]
});

function updateReplicaMetrics(replicaMonitor) {
  const replicas = replicaMonitor.getStateSnapshot();

  for (const replica of replicas) {
    replicaScoreGauge.set({ replica: replica.name }, replica.score);
    replicaCpuGauge.set({ replica: replica.name }, replica.metrics.cpuPercent || 0);
    replicaMemoryGauge.set({ replica: replica.name }, replica.metrics.memoryPercent || 0);
    replicaConnectionsGauge.set({ replica: replica.name }, replica.metrics.activeConnections || 0);
    replicaLatencyGauge.set({ replica: replica.name }, (replica.metrics.averageLatencyMs || 0) / 1000);
  }
}

function createApp(queryController, replicaMonitor) {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use(express.text({ type: ['text/plain', 'application/sql'], limit: '1mb' }));

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      replicas: replicaMonitor.getStateSnapshot().map((replica) => ({
        name: replica.name,
        score: replica.score,
        unhealthy: replica.metrics.unhealthy,
        stale: replica.metrics.isStale,
        cpuPercent: replica.metrics.cpuPercent,
        memoryPercent: replica.metrics.memoryPercent,
        activeConnections: replica.metrics.activeConnections,
        averageLatencyMs: replica.metrics.averageLatencyMs
      }))
    });
  });

  app.get('/metrics', async (req, res, next) => {
    try {
      updateReplicaMetrics(replicaMonitor);
      res.set('Content-Type', registry.contentType);
      res.end(await registry.metrics());
    } catch (error) {
      next(error);
    }
  });

  app.locals.metrics = {
    queryLatencyHistogram,
    routedQueriesCounter
  };

  app.use(createQueryRoutes(queryController));
  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp
};