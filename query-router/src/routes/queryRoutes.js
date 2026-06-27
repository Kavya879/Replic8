const express = require('express');

function createQueryRoutes(queryController, authMiddleware) {
  const router = express.Router();
  const auth = authMiddleware || ((req, res, next) => next());

  router.post('/query', auth, queryController.executeQuery);

  return router;
}

module.exports = {
  createQueryRoutes
};
