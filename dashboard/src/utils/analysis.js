// ── ML-Based Analysis Utilities ──
// All ML model training is done via Python (scikit-learn, statsmodels)
// Results are loaded from /ml_results/*.json at runtime
// This file only provides lightweight helper functions for the dashboard

/**
 * Compute basic statistics for a dataset key (used for display only)
 */
export function computeStats(data, key) {
  const values = data.map(d => Number(d[key]) || 0).filter(v => !isNaN(v));
  const n = values.length;
  if (n === 0) return { mean: 0, std: 0, min: 0, max: 0, median: 0, count: 0 };

  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n);
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];

  return {
    mean: parseFloat(mean.toFixed(3)),
    std: parseFloat(std.toFixed(3)),
    min: parseFloat(sorted[0].toFixed(3)),
    max: parseFloat(sorted[n - 1].toFixed(3)),
    median: parseFloat(median.toFixed(3)),
    count: n,
  };
}

/**
 * Moving Average — used only for dashboard trend chart visualization
 */
export function movingAverage(data, key, windowSize = 5) {
  return data.map((d, i) => {
    const start = Math.max(0, i - windowSize + 1);
    const window = data.slice(start, i + 1);
    const avg = window.reduce((sum, w) => sum + (Number(w[key]) || 0), 0) / window.length;
    return { ...d, [`${key}_MA`]: parseFloat(avg.toFixed(3)) };
  });
}

/**
 * Simple Linear Regression — used only for dashboard trend chart visualization
 */
export function linearRegression(data, xKey, yKey) {
  const n = data.length;
  if (n < 2) return { slope: 0, intercept: 0, rSquared: 0, predict: () => 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  const points = data.map(d => ({ x: Number(d[xKey]) || 0, y: Number(d[yKey]) || 0 }));
  points.forEach(({ x, y }) => { sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x; });

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, rSquared: 0, predict: () => sumY / n };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  let ssTot = 0, ssRes = 0;
  points.forEach(({ x, y }) => { ssTot += (y - meanY) ** 2; ssRes += (y - (slope * x + intercept)) ** 2; });
  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, intercept, rSquared, predict: (x) => slope * x + intercept };
}

/**
 * Exponential Smoothing — used only for dashboard trend chart visualization
 */
export function exponentialSmoothing(data, key, alpha = 0.3) {
  if (!data.length) return data;
  let prev = Number(data[0][key]) || 0;
  return data.map((d, i) => {
    const val = Number(d[key]) || 0;
    const smoothed = i === 0 ? val : alpha * val + (1 - alpha) * prev;
    prev = smoothed;
    return { ...d, [`${key}_ES`]: parseFloat(smoothed.toFixed(3)) };
  });
}