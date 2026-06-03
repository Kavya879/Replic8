const express = require('express');
const { createQueryRoutes } = require('./routes/queryRoutes');
const { errorHandler } = require('./middleware/errorHandler');

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

  app.use(createQueryRoutes(queryController));
  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp
};