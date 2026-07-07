const express = require('express');

function createClusterRoutes(clusterController, authMiddleware) {
  const router = express.Router();
  const auth = authMiddleware || ((req, res, next) => next());

  router.post('/:node/start', auth, clusterController.startNode);
  router.post('/:node/stop', auth, clusterController.stopNode);
  router.post('/:node/restart', auth, clusterController.restartNode);
  router.get('/:node/status', auth, clusterController.nodeStatus);

  return router;
}

module.exports = {
  createClusterRoutes
};
