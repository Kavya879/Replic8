const express = require('express');
const { createQueryRoutes } = require('./routes/queryRoutes');
const { errorHandler } = require('./middleware/errorHandler');

function createApp(queryController) {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use(express.text({ type: ['text/plain', 'application/sql'], limit: '1mb' }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(createQueryRoutes(queryController));
  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp
};