const http = require('http');

function dockerRequest(pathname, method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath: '/var/run/docker.sock',
      path: pathname,
      method: method,
      timeout: 10000 // give more time for start/stop
    }, (response) => {
      let body = '';

      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        if (response.statusCode && response.statusCode >= 400) {
          if (response.statusCode === 304) {
            resolve({ status: 'not-modified' });
            return;
          }
          reject(new Error(`Docker API request failed with status ${response.statusCode}: ${body}`));
          return;
        }

        try {
          resolve(body ? JSON.parse(body) : { status: 'success' });
        } catch (error) {
          // If not JSON, just return success if we got here
          resolve({ status: 'success', raw: body });
        }
      });
    });

    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Docker API request timed out'));
    });

    request.on('error', reject);
    request.end();
  });
}

async function resolveContainerId(serviceName) {
  const filters = encodeURIComponent(JSON.stringify({ label: [`com.docker.compose.service=${serviceName}`] }));
  const containers = await dockerRequest(`/containers/json?all=1&filters=${filters}`, 'GET');

  if (!Array.isArray(containers) || containers.length === 0) {
    return null;
  }

  return containers[0].Id;
}

async function getContainerStatus(serviceName) {
  const containerId = await resolveContainerId(serviceName);
  if (!containerId) {
    throw new Error(`Container for service ${serviceName} not found`);
  }
  
  const inspect = await dockerRequest(`/containers/${containerId}/json`, 'GET');
  return inspect.State; // returns state object containing Status, Running, etc.
}

async function startContainer(serviceName) {
  const containerId = await resolveContainerId(serviceName);
  if (!containerId) {
    throw new Error(`Container for service ${serviceName} not found`);
  }
  return dockerRequest(`/containers/${containerId}/start`, 'POST');
}

async function stopContainer(serviceName) {
  const containerId = await resolveContainerId(serviceName);
  if (!containerId) {
    throw new Error(`Container for service ${serviceName} not found`);
  }
  return dockerRequest(`/containers/${containerId}/stop`, 'POST');
}

async function restartContainer(serviceName) {
  const containerId = await resolveContainerId(serviceName);
  if (!containerId) {
    throw new Error(`Container for service ${serviceName} not found`);
  }
  return dockerRequest(`/containers/${containerId}/restart`, 'POST');
}

module.exports = {
  startContainer,
  stopContainer,
  restartContainer,
  getContainerStatus
};
