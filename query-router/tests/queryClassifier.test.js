const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyQuery } = require('../src/routing/queryClassifier');

test('classifyQuery routes SELECT statements to a replica', () => {
  const result = classifyQuery('SELECT * FROM users');
  assert.equal(result.statementType, 'READ');
  assert.equal(result.route, 'replica');
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

test('classifyQuery routes DDL and maintenance statements to the primary', () => {
  for (const sql of ['TRUNCATE users', 'DROP TABLE users', 'CREATE TABLE t (id int)', 'ALTER TABLE t ADD COLUMN c int', 'MERGE INTO t USING s ON t.id = s.id WHEN MATCHED THEN UPDATE SET x = 1']) {
    const result = classifyQuery(sql);
    assert.equal(result.statementType, 'WRITE', `expected WRITE for: ${sql}`);
    assert.equal(result.route, 'primary', `expected primary for: ${sql}`);
  }
});

test('classifyQuery throws on a genuinely unknown statement verb', () => {
  assert.throws(() => classifyQuery('FOOBAR something'), /Unsupported SQL statement type: FOOBAR/);
});

test('classifyQuery routes locking reads (FOR UPDATE/SHARE) to the primary', () => {
  for (const clause of ['FOR UPDATE', 'FOR NO KEY UPDATE', 'FOR SHARE', 'FOR KEY SHARE']) {
    const result = classifyQuery(`SELECT * FROM accounts WHERE id = 1 ${clause}`);
    assert.equal(result.route, 'primary', `expected primary for: ${clause}`);
    assert.equal(result.statementType, 'READ', `locking read should stay READ for: ${clause}`);
  }
});

test('classifyQuery routes a read-only CTE to a replica', () => {
  const sql = 'WITH recent AS (SELECT id FROM orders WHERE created_at > now() - interval \'1 day\') SELECT count(*) FROM recent';
  const result = classifyQuery(sql);
  assert.equal(result.route, 'replica');
  assert.equal(result.statementType, 'READ');
});

test('classifyQuery routes a data-modifying CTE to the primary', () => {
  const sql = 'WITH moved AS (DELETE FROM staging RETURNING *) INSERT INTO final SELECT * FROM moved';
  const result = classifyQuery(sql);
  assert.equal(result.route, 'primary');
  assert.equal(result.statementType, 'WRITE');
});

test('classifyQuery routes SHOW and plain EXPLAIN to a replica', () => {
  assert.equal(classifyQuery('SHOW max_connections').route, 'replica');
  assert.equal(classifyQuery('EXPLAIN SELECT * FROM users').route, 'replica');
});

test('classifyQuery routes EXPLAIN ANALYZE to the primary (it executes the statement)', () => {
  const result = classifyQuery('EXPLAIN ANALYZE SELECT * FROM users');
  assert.equal(result.route, 'primary');
});

test('classifyQuery rejects transaction-control statements', () => {
  for (const sql of ['BEGIN', 'START TRANSACTION', 'COMMIT', 'ROLLBACK', 'SAVEPOINT s1']) {
    assert.throws(() => classifyQuery(sql), /Transaction control statements/, `expected rejection for: ${sql}`);
  }
});
