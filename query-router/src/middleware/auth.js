const crypto = require('crypto');

// Pulls an API key out of an HTTP request, accepting either:
//   Authorization: Bearer <key>
//   X-API-Key: <key>
function extractApiKey(req) {
  const authHeader = req.headers && req.headers['authorization'];
  if (typeof authHeader === 'string' && /^bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^bearer\s+/i, '').trim();
  }

  const apiKeyHeader = req.headers && req.headers['x-api-key'];
  if (typeof apiKeyHeader === 'string' && apiKeyHeader.trim()) {
    return apiKeyHeader.trim();
  }

  return '';
}

// Constant-time string comparison to avoid leaking the key via timing.
function safeEqual(provided, expected) {
  const providedBuffer = Buffer.from(String(provided));
  const expectedBuffer = Buffer.from(String(expected));
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

// When no key is configured the service runs in (clearly warned) open mode and
// every request is allowed. When a key IS configured, the provided key must match.
function isAuthorized(providedKey, expectedKey) {
  if (!expectedKey) {
    return true;
  }
  return Boolean(providedKey) && safeEqual(providedKey, expectedKey);
}

function createApiKeyAuth(expectedKey) {
  return function apiKeyAuth(req, res, next) {
    if (isAuthorized(extractApiKey(req), expectedKey)) {
      return next();
    }
    res.status(401).json({ error: 'Unauthorized: a valid API key is required.' });
  };
}

module.exports = {
  createApiKeyAuth,
  isAuthorized,
  extractApiKey,
  safeEqual
};
