// Thin HTTP client around the Query Router's POST /query endpoint.
// Uses the global fetch available in Node 18+ (developed on Node 22).

const { performance } = require('node:perf_hooks');

const API_KEY = (process.env.BENCH_API_KEY || process.env.API_KEY || '').trim();

// Auth header for the router when an API key is configured (no-op otherwise).
function authHeaders() {
  return API_KEY ? { 'X-API-Key': API_KEY } : {};
}

async function postQuery(routerUrl, sql, params = []) {
  const startedAt = performance.now();

  try {
    const response = await fetch(`${routerUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ sql, params })
    });

    const elapsedMs = performance.now() - startedAt;

    if (!response.ok) {
      // Drain the body so the socket can be reused.
      const text = await response.text().catch(() => '');
      return { ok: false, ms: elapsedMs, status: response.status, error: text || `HTTP ${response.status}` };
    }

    const body = await response.json();
    return { ok: true, ms: elapsedMs, pool: body.pool, route: body.route, rowCount: body.rowCount };
  } catch (error) {
    return { ok: false, ms: performance.now() - startedAt, error: error.message };
  }
}

module.exports = {
  postQuery,
  authHeaders
};
