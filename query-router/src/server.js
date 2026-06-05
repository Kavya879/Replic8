const { loadConfig } = require('./config/env');
const { createPools } = require('./config/pools');
const { createReplicaMonitor } = require('./monitoring/replicaMonitor');
const { createPoolRouter } = require('./routing/poolRouter');
const { createQueryController } = require('./controllers/queryController');
const { createApp } = require('./app');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const config = loadConfig();
const pools = createPools(config);

const allNodes = [
  {
    name: 'postgres-primary',
    serviceName: 'postgres-primary',
    pool: pools.primaryPool,
    isConfiguredPrimary: true
  },
  ...pools.replicaPools.map((r) => ({
    name: r.name,
    serviceName: r.serviceName,
    pool: r.pool,
    isConfiguredPrimary: false
  }))
];

const replicaMonitor = createReplicaMonitor(allNodes, config);
replicaMonitor.start();
const poolRouter = createPoolRouter(replicaMonitor);
const queryController = createQueryController(poolRouter);
const app = createApp(queryController, replicaMonitor);
const server = http.createServer(app);
const websocketServer = new WebSocketServer({ server, path: '/ws/cluster' });

function broadcastSnapshot(payload) {
  const message = JSON.stringify({
    type: 'cluster-snapshot',
    ...payload
  });

  for (const client of websocketServer.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

websocketServer.on('connection', (client) => {
  client.send(JSON.stringify({
    type: 'cluster-snapshot',
    reason: 'initial',
    ...replicaMonitor.getClusterSnapshot()
  }));
});

replicaMonitor.subscribe((payload) => {
  broadcastSnapshot(payload);
});

server.listen(config.port, () => {
  console.log(`Query Router listening on port ${config.port}`);
});