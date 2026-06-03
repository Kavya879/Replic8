const http = require('http');

function dockerRequest(pathname) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath: '/var/run/docker.sock',
      path: pathname,
      method: 'GET'
    }, (response) => {
      let body = '';

      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`Docker API request failed with status ${response.statusCode}`));
          return;
        }

        try {
          resolve(body ? JSON.parse(body) : null);
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on('error', reject);
    request.end();
  });
}

async function resolveContainerId(serviceName) {
  const filters = encodeURIComponent(JSON.stringify({ label: [`com.docker.compose.service=${serviceName}`] }));
  const containers = await dockerRequest(`/containers/json?all=1&filters=${filters}`);

  if (!Array.isArray(containers) || containers.length === 0) {
    return null;
  }

  return containers[0].Id;
}

function calculateCpuPercent(stats) {
  const cpuTotal = stats?.cpu_stats?.cpu_usage?.total_usage || 0;
  const previousCpuTotal = stats?.precpu_stats?.cpu_usage?.total_usage || 0;
  const systemTotal = stats?.cpu_stats?.system_cpu_usage || 0;
  const previousSystemTotal = stats?.precpu_stats?.system_cpu_usage || 0;
  const cpuDelta = cpuTotal - previousCpuTotal;
  const systemDelta = systemTotal - previousSystemTotal;
  const onlineCpus = stats?.cpu_stats?.online_cpus || 1;

  if (cpuDelta <= 0 || systemDelta <= 0) {
    return 0;
  }

  return (cpuDelta / systemDelta) * onlineCpus * 100;
}

function calculateMemoryPercent(stats) {
  const usage = stats?.memory_stats?.usage || 0;
  const limit = stats?.memory_stats?.limit || 1;

  return limit > 0 ? (usage / limit) * 100 : 0;
}

async function collectContainerMetrics(serviceName) {
  const containerId = await resolveContainerId(serviceName);

  if (!containerId) {
    return {
      containerId: null,
      cpuPercent: 0,
      memoryPercent: 0
    };
  }

  const stats = await dockerRequest(`/containers/${containerId}/stats?stream=false`);

  return {
    containerId,
    cpuPercent: calculateCpuPercent(stats),
    memoryPercent: calculateMemoryPercent(stats)
  };
}

module.exports = {
  collectContainerMetrics
};