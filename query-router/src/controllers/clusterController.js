const { startContainer, stopContainer, restartContainer, getContainerStatus } = require('../monitoring/dockerManager');

function createClusterController(replicaMonitor) {
  // Utility to get docker service name from node name (e.g. postgres-primary)
  function getServiceName(nodeName) {
    const node = replicaMonitor.getNodeByName(nodeName);
    if (node && node.serviceName) {
        return node.serviceName;
    }
    // Fallback: if not found, just use the name as serviceName (as they are identical in our setup)
    return nodeName; 
  }

  async function startNode(req, res, next) {
    try {
      const nodeName = req.params.node;
      const serviceName = getServiceName(nodeName);
      await startContainer(serviceName);
      res.json({ status: 'success', message: `Node ${nodeName} started` });
    } catch (error) {
      next(error);
    }
  }

  async function stopNode(req, res, next) {
    try {
      const nodeName = req.params.node;
      const serviceName = getServiceName(nodeName);
      await stopContainer(serviceName);
      res.json({ status: 'success', message: `Node ${nodeName} stopped` });
    } catch (error) {
      next(error);
    }
  }

  async function restartNode(req, res, next) {
    try {
      const nodeName = req.params.node;
      const serviceName = getServiceName(nodeName);
      await restartContainer(serviceName);
      res.json({ status: 'success', message: `Node ${nodeName} restarted` });
    } catch (error) {
      next(error);
    }
  }

  async function nodeStatus(req, res, next) {
    try {
      const nodeName = req.params.node;
      const serviceName = getServiceName(nodeName);
      const status = await getContainerStatus(serviceName);
      res.json({ status: 'success', data: status });
    } catch (error) {
      next(error);
    }
  }

  return {
    startNode,
    stopNode,
    restartNode,
    nodeStatus
  };
}

module.exports = {
  createClusterController
};
