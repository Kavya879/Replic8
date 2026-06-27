const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyQuery } = require('../src/routing/queryClassifier');

test('classifyQuery routes SELECT statements to a replica', () => {
  const result = classifyQuery('SELECT * FROM users');
  assert.deepEqual(result, { statementType: 'READ', route: 'replica' });
});

test('classifyQuery is case-insensitive for the leading verb', () => {
  assert.equal(classifyQuery('select 1').route, 'replica');
  assert.equal(classifyQuery('InSeRt INTO t VALUES (1)').route, 'primary');
});

test('classifyQuery routes INSERT/UPDATE/DELETE statements to the primary', () => {
  for (const sql of [
    'INSERT INTO users (name) VALUES ($1)',
    'UPDATE users SET name = $1 WHERE id = $2',
    'DELETE FROM users WHERE id = $1'
  ]) {
    const result = classifyQuery(sql);
    assert.equal(result.statementType, 'WRITE', `expected WRITE for: ${sql}`);
    assert.equal(result.route, 'primary', `expected primary for: ${sql}`);
  }
});

test('classifyQuery ignores leading single-line comments', () => {
  const sql = '-- fetch active users\nSELECT * FROM users WHERE active = true';
  assert.equal(classifyQuery(sql).route, 'replica');
});

test('classifyQuery ignores leading block comments', () => {
  const sql = '/* reporting query */ SELECT count(*) FROM orders';
  assert.equal(classifyQuery(sql).route, 'replica');
});

test('classifyQuery ignores multiple stacked leading comments and whitespace', () => {
  const sql = '   -- one\n  /* two */\n  -- three\n  UPDATE t SET x = 1';
  assert.equal(classifyQuery(sql).route, 'primary');
});

test('classifyQuery throws on empty or non-string input', () => {
  assert.throws(() => classifyQuery(''), /SQL text is required/);
  assert.throws(() => classifyQuery('   '), /SQL text is required/);
  assert.throws(() => classifyQuery(null), /SQL text is required/);
  assert.throws(() => classifyQuery(42), /SQL text is required/);
});

test('classifyQuery throws when no statement verb can be detected', () => {
  assert.throws(() => classifyQuery('/* unterminated comment'), /Unable to detect the SQL statement type/);
  assert.throws(() => classifyQuery('123 not sql'), /Unable to detect the SQL statement type/);
});

test('classifyQuery throws on unsupported statement types', () => {
  for (const sql of ['TRUNCATE users', 'DROP TABLE users', 'CREATE TABLE t (id int)', 'ALTER TABLE t ADD COLUMN c int']) {
    assert.throws(() => classifyQuery(sql), /Unsupported SQL statement type/, `expected unsupported error for: ${sql}`);
  }
});
