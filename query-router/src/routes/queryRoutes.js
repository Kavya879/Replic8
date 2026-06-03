const express = require('express');

function createQueryRoutes(queryController) {
  const router = express.Router();

  router.post('/query', queryController.executeQuery);

  return router;
}

module.exports = {
  createQueryRoutes
};