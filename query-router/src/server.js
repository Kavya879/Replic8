const { loadConfig } = require('./config/env');
const { createPools } = require('./config/pools');
const { createReplicaMonitor } = require('./monitoring/replicaMonitor');
const { createPoolRouter } = require('./routing/poolRouter');
const { createQueryController } = require('./controllers/queryController');
const { createApp } = require('./app');

const config = loadConfig();
const pools = createPools(config);
const replicaMonitor = createReplicaMonitor(pools.replicaPools, config);
replicaMonitor.start();
const poolRouter = createPoolRouter(pools.primaryPool, replicaMonitor);
const queryController = createQueryController(poolRouter);
const app = createApp(queryController, replicaMonitor);

app.listen(config.port, () => {
  console.log(`Query Router listening on port ${config.port}`);
});