// Linear-interpolation percentile over an unsorted sample of numbers.
// p is expressed in the [0, 100] range. Returns 0 for an empty sample.
function percentile(samples, p) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return 0;
  }

  const sorted = [...samples].sort((a, b) => a - b);
  if (sorted.length === 1) {
    return sorted[0];
  }

  const rank = (p / 100) * (sorted.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const weight = rank - lowerIndex;

  return sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * weight;
}

module.exports = {
  percentile
};
