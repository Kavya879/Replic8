const test = require('node:test');
const assert = require('node:assert/strict');

const { errorHandler } = require('../src/middleware/errorHandler');
const { classifyQuery } = require('../src/routing/queryClassifier');

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    headersSent: false,
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

function run(error) {
  const res = fakeRes();
  errorHandler(error, {}, res, () => {});
  return res;
}

test('errorHandler honors an explicit statusCode', () => {
  const res = run(Object.assign(new Error('bad input'), { statusCode: 400 }));
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'bad input');
});

test('errorHandler defaults unknown errors to 500', () => {
  const res = run(new Error('something exploded'));
  assert.equal(res.statusCode, 500);
});

test('errorHandler maps heuristic client-error messages to 400', () => {
  assert.equal(run(new Error('No replica is available')).statusCode, 400);
  assert.equal(run(new Error('sql text is required')).statusCode, 400);
});

test('classifier errors carry a 400 status and produce a 400 response', () => {
  for (const sql of ['', 'FOOBAR x', 'BEGIN']) {
    let thrown;
    try {
      classifyQuery(sql);
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown, `expected classifyQuery to throw for: ${JSON.stringify(sql)}`);
    assert.equal(thrown.statusCode, 400, `expected statusCode 400 for: ${JSON.stringify(sql)}`);
    assert.equal(run(thrown).statusCode, 400);
  }
});
