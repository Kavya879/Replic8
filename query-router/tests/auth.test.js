const test = require('node:test');
const assert = require('node:assert/strict');

const { createApiKeyAuth, isAuthorized, extractApiKey } = require('../src/middleware/auth');

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function runAuth(expectedKey, headers) {
  const middleware = createApiKeyAuth(expectedKey);
  const req = { headers: headers || {} };
  const res = fakeRes();
  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });
  return { nextCalled, res };
}

test('extractApiKey reads a Bearer token', () => {
  assert.equal(extractApiKey({ headers: { authorization: 'Bearer secret-123' } }), 'secret-123');
  assert.equal(extractApiKey({ headers: { authorization: 'bearer secret-123' } }), 'secret-123');
});

test('extractApiKey reads an X-API-Key header', () => {
  assert.equal(extractApiKey({ headers: { 'x-api-key': 'secret-123' } }), 'secret-123');
});

test('extractApiKey returns empty string when no key is present', () => {
  assert.equal(extractApiKey({ headers: {} }), '');
  assert.equal(extractApiKey({}), '');
});

test('isAuthorized allows everything when no key is configured (open mode)', () => {
  assert.equal(isAuthorized('', ''), true);
  assert.equal(isAuthorized('anything', ''), true);
});

test('isAuthorized requires an exact match when a key is configured', () => {
  assert.equal(isAuthorized('secret-123', 'secret-123'), true);
  assert.equal(isAuthorized('wrong', 'secret-123'), false);
  assert.equal(isAuthorized('', 'secret-123'), false);
  // Differing lengths must not throw and must be rejected.
  assert.equal(isAuthorized('short', 'a-much-longer-secret'), false);
});

test('middleware calls next() in open mode', () => {
  const { nextCalled, res } = runAuth('', {});
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('middleware calls next() with a valid Bearer key', () => {
  const { nextCalled } = runAuth('secret-123', { authorization: 'Bearer secret-123' });
  assert.equal(nextCalled, true);
});

test('middleware calls next() with a valid X-API-Key', () => {
  const { nextCalled } = runAuth('secret-123', { 'x-api-key': 'secret-123' });
  assert.equal(nextCalled, true);
});

test('middleware responds 401 when the key is missing', () => {
  const { nextCalled, res } = runAuth('secret-123', {});
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /Unauthorized/);
});

test('middleware responds 401 when the key is wrong', () => {
  const { nextCalled, res } = runAuth('secret-123', { 'x-api-key': 'nope' });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});
