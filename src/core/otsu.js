/* Port of OtsuThreshold.kt (64-bin histogram Otsu over a list of darkness values; returns {threshold, separability} or null). */
export function otsuCompute(values, rangeMin = 0, rangeMax = 255, bins = 64) {
  if (values.length < 4) return null;
  const binWidth = (rangeMax - rangeMin) / bins; if (binWidth <= 0) return null;
  const hist = new Int32Array(bins);
  for (const v of values) { let b = Math.trunc((v - rangeMin) / binWidth); b = Math.min(Math.max(b, 0), bins - 1); hist[b]++; }
  const total = values.length; let sum = 0;
  for (let i = 0; i < bins; i++) sum += i * hist[i];
  const globalMean = sum / total; let totalVariance = 0;
  for (let i = 0; i < bins; i++) totalVariance += hist[i] * (i - globalMean) * (i - globalMean);
  totalVariance /= total;
  let sumB = 0, wB = 0, maxVar = -1, bestBin = -1;
  for (let i = 0; i < bins; i++) {
    wB += hist[i]; if (wB === 0) continue;
    const wF = total - wB; if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
    if (v > maxVar) { maxVar = v; bestBin = i; }
  }
  if (bestBin < 0) return null;
  const between = (maxVar / total) / total;
  const separability = totalVariance > 0 ? Math.min(Math.max(between / totalVariance, 0), 1) : 0;
  return { threshold: rangeMin + (bestBin + 1) * binWidth, separability };
}
