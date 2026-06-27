const test = require('node:test');
const assert = require('node:assert/strict');

const { lsnToBigInt, lsnDiffBytes } = require('../src/utils/lsn');

test('lsnToBigInt parses the two hex segments into a 64-bit value', () => {
  assert.equal(lsnToBigInt('0/0'), 0n);
  assert.equal(lsnToBigInt('0/FF'), 255n);
  // High segment is the upper 32 bits.
  assert.equal(lsnToBigInt('1/0'), 1n << 32n);
  assert.equal(lsnToBigInt('16/B374D848'), (0x16n << 32n) + 0xb374d848n);
});

test('lsnToBigInt returns null for malformed input', () => {
  assert.equal(lsnToBigInt(null), null);
  assert.equal(lsnToBigInt(''), null);
  assert.equal(lsnToBigInt('not-an-lsn'), null);
  assert.equal(lsnToBigInt(42), null);
});

test('lsnDiffBytes returns the non-negative byte distance ahead minus behind', () => {
  assert.equal(lsnDiffBytes('16/100', '16/C0'), 64);
  assert.equal(lsnDiffBytes('0/0', '0/0'), 0);
  assert.equal(lsnDiffBytes('1/0', '0/0'), 2 ** 32);
});

test('lsnDiffBytes clamps a behind-ahead (negative) difference to zero', () => {
  assert.equal(lsnDiffBytes('16/C0', '16/100'), 0);
});

test('lsnDiffBytes returns null when either LSN is unparseable', () => {
  assert.equal(lsnDiffBytes(null, '0/0'), null);
  assert.equal(lsnDiffBytes('0/0', 'bad'), null);
});
