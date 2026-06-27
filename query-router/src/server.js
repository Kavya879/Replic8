const { loadConfig } = require('./config/env');
const { createPools } = require('./config/pools');
const { createReplicaMonitor } = require('./monitoring/replicaMonitor');
const { createPoolRouter } = require('./routing/poolRouter');
const { createQueryController } = require('./controllers/queryController');
const { createApp } = require('./app');
const { isAuthorized } = require('./middleware/auth');
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
const app = createApp(queryController, replicaMonitor, config);
const server = http.createServer(app);
const websocketServer = new WebSocketServer({ server, path: '/ws/cluster' });

// Extracts an API key from a WebSocket upgrade request. Browsers cannot set
// custom headers on a WebSocket, so a token query parameter is also accepted.
function extractWebsocketKey(request) {
  try {
    const requestUrl = new URL(request.url, 'http://localhost');
    const token = requestUrl.searchParams.get('token') || requestUrl.searchParams.get('apiKey');
    if (token) {
      return token;
    }
  } catch (error) {
    // fall through to headers
  }

  const header = request.headers && (request.headers['x-api-key'] || request.headers.authorization);
  if (typeof header === 'string') {
    return header.replace(/^bearer\s+/i, '').trim();
  }
  return '';
}

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

websocketServer.on('connection', (client, request) => {
  if (!isAuthorized(extractWebsocketKey(request), config.apiKey)) {
    client.send(JSON.stringify({ type: 'error', reason: 'unauthorized' }));
    client.close(1008, 'Unauthorized');
    return;
  }

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
  if (config.apiKey) {
    console.log('[Security] API key authentication is ENABLED for POST /query and the metrics WebSocket.');
  } else {
    console.warn('[Security] WARNING: No API_KEY set. POST /query accepts arbitrary SQL and the metrics WebSocket are UNAUTHENTICATED. Set API_KEY to require a key.');
  }
});

// Graceful shutdown: stop the monitor loop, refuse new connections, drain the
// WebSocket clients, and close the PostgreSQL pools so in-flight work can finish
// and the process exits cleanly under `docker stop` (SIGTERM) or Ctrl+C (SIGINT).
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`[Shutdown] Received ${signal}, shutting down gracefully...`);

  replicaMonitor.stop();

  for (const client of websocketServer.clients) {
    try {
      client.close(1001, 'Server shutting down');
    } catch (error) {
      // ignore
    }
  }
  websocketServer.close();

  server.close(async () => {
    try {
      await pools.primaryPool.end();
      await Promise.all(pools.replicaPools.map((replica) => replica.pool.end()));
      console.log('[Shutdown] Connection pools closed. Bye.');
    } catch (error) {
      console.error('[Shutdown] Error while closing pools:', error.message);
    } finally {
      process.exit(0);
    }
  });

  // Safety net: force exit if graceful close stalls.
  setTimeout(() => {
    console.error('[Shutdown] Forced exit after timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));