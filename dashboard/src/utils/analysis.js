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

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function toFixedNumber(value, digits = 3) {
  return Number.parseFloat(Number(value).toFixed(digits));
}

function computeDangerBounds(values, thresholds) {
  const p05 = percentile(values, 0.05);
  const p95 = percentile(values, 0.95);
  const iqr = percentile(values, 0.75) - percentile(values, 0.25);
  const fallbackSpread = Math.max(iqr * 0.5, (thresholds.warning_high - thresholds.warning_low) * 0.35, 0.01);

  const dangerLow = Math.min(thresholds.warning_low - fallbackSpread, p05);
  const dangerHigh = Math.max(thresholds.warning_high + fallbackSpread, p95);

  return {
    danger_low: toFixedNumber(dangerLow),
    danger_high: toFixedNumber(dangerHigh),
  };
}

export function buildHistoricalBands(data, key, thresholdResult) {
  const values = data.map(item => Number(item[key])).filter(value => Number.isFinite(value));
  if (!values.length) return null;

  const warningLow = thresholdResult?.gmm_thresholds?.thresholds?.warning_low;
  const warningHigh = thresholdResult?.gmm_thresholds?.thresholds?.warning_high;
  const bands = Number.isFinite(warningLow) && Number.isFinite(warningHigh)
    ? { warning_low: warningLow, warning_high: warningHigh }
    : {
        warning_low: percentile(values, 0.2),
        warning_high: percentile(values, 0.8),
      };

  const danger = computeDangerBounds(values, bands);
  const latest = Number(data[data.length - 1]?.[key]);

  return {
    median: toFixedNumber(median(values)),
    recentMean: toFixedNumber(values.slice(-Math.min(values.length, 24)).reduce((sum, value) => sum + value, 0) / Math.min(values.length, 24)),
    normalLow: toFixedNumber(bands.warning_low),
    normalHigh: toFixedNumber(bands.warning_high),
    unusualLow: danger.danger_low,
    unusualHigh: danger.danger_high,
    min: toFixedNumber(Math.min(...values)),
    max: toFixedNumber(Math.max(...values)),
    latest: Number.isFinite(latest) ? toFixedNumber(latest) : null,
  };
}

export function classifyHistoricalValue(value, bands) {
  if (!Number.isFinite(value) || !bands) {
    return { level: 'unknown', label: 'No reading', color: '#94a3b8', priority: 0 };
  }

  if (value < bands.unusualLow) {
    return { level: 'danger-low', label: 'Unusual low', color: '#dc2626', priority: 4 };
  }
  if (value > bands.unusualHigh) {
    return { level: 'danger-high', label: 'Unusual high', color: '#dc2626', priority: 4 };
  }
  if (value < bands.normalLow) {
    return { level: 'warning-low', label: 'Below usual range', color: '#d97706', priority: 3 };
  }
  if (value > bands.normalHigh) {
    return { level: 'warning-high', label: 'Above usual range', color: '#d97706', priority: 3 };
  }
  return { level: 'normal', label: 'Within usual range', color: '#059669', priority: 1 };
}

export function buildHistoricalAlertModel({ sensor, data, dataKey, thresholdResult, anomalyResult }) {
  if (!sensor || !data?.length || !dataKey) return null;

  const bands = buildHistoricalBands(data, dataKey, thresholdResult);
  if (!bands) return null;

  const enriched = data.map((item) => {
    const value = Number(item[dataKey]);
    const status = classifyHistoricalValue(value, bands);
    return {
      ...item,
      value,
      status,
      isAlert: status.level !== 'normal' && status.level !== 'unknown',
    };
  });

  const latest = enriched[enriched.length - 1];
  const recent = enriched.slice(-Math.min(enriched.length, 24));
  const counts = {
    normal: recent.filter(item => item.status.level === 'normal').length,
    warningLow: recent.filter(item => item.status.level === 'warning-low').length,
    warningHigh: recent.filter(item => item.status.level === 'warning-high').length,
    dangerLow: recent.filter(item => item.status.level === 'danger-low').length,
    dangerHigh: recent.filter(item => item.status.level === 'danger-high').length,
  };

  const activeLevel = recent.reduce((current, item) => item.status.priority > current.priority ? item.status : current, latest.status);
  const zoneCounts = thresholdResult?.gmm_thresholds?.zone_counts || {};
  const modelName = anomalyResult?.best_model?.replace(/_/g, ' ') || 'Historical banding';

  return {
    sensor,
    dataKey,
    bands,
    enriched,
    latest,
    activeLevel,
    recentCounts: counts,
    zoneCounts: {
      normal: zoneCounts.normal || 0,
      warning: zoneCounts.warning || 0,
      danger: zoneCounts.danger || 0,
    },
    modelName,
    anomalyCount: enriched.filter(item => item.isAlert).length,
    healthScore: Math.max(0, Math.round((counts.normal / Math.max(recent.length, 1)) * 100)),
    alertItems: recent
      .filter(item => item.isAlert)
      .map(item => ({
        sensor: sensor.label,
        sensorId: sensor.id,
        sensorColor: sensor.color,
        unit: sensor.unit,
        value: item.value,
        status: item.status,
        time: item.Timestamp,
        thresholdText: `Usual ${bands.normalLow.toFixed(2)} to ${bands.normalHigh.toFixed(2)}${sensor.unit ? ` ${sensor.unit}` : ''}`,
      }))
      .reverse(),
  };
}