const { loadConfig } = require('./config/env');
const { createPools } = require('./config/pools');
const { createPoolRouter } = require('./routing/poolRouter');
const { createQueryController } = require('./controllers/queryController');
const { createApp } = require('./app');

const config = loadConfig();
const pools = createPools(config);
const poolRouter = createPoolRouter(pools.primaryPool, pools.replicaPools);
const queryController = createQueryController(poolRouter);
const app = createApp(queryController);

app.listen(config.port, () => {
  console.log(`Query Router listening on port ${config.port}`);
});