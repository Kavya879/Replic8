// Helpers for working with PostgreSQL Log Sequence Numbers (LSNs).
//
// An LSN is printed as two hex segments separated by a slash, e.g. "16/B374D848".
// The high segment is the upper 32 bits and the low segment the lower 32 bits of
// a 64-bit byte position in the write-ahead log. We use BigInt so we never lose
// precision on the full 64-bit value.

function lsnToBigInt(lsn) {
  if (typeof lsn !== 'string' || !lsn.includes('/')) {
    return null;
  }

  const [highPart, lowPart] = lsn.split('/');
  const high = Number.parseInt(highPart, 16);
  const low = Number.parseInt(lowPart, 16);

  if (!Number.isFinite(high) || !Number.isFinite(low)) {
    return null;
  }

  return (BigInt(high) << 32n) + BigInt(low);
}

// Byte distance from `aheadLsn` to `behindLsn` (i.e. aheadLsn - behindLsn).
// Returns a non-negative Number of bytes, or null if either LSN is unparseable.
function lsnDiffBytes(aheadLsn, behindLsn) {
  const ahead = lsnToBigInt(aheadLsn);
  const behind = lsnToBigInt(behindLsn);

  if (ahead === null || behind === null) {
    return null;
  }

  const diff = ahead - behind;
  return Number(diff < 0n ? 0n : diff);
}

module.exports = {
  lsnToBigInt,
  lsnDiffBytes
};
