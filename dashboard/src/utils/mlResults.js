// ── ML Model Results Loader ──
// Loads pre-trained ML model outputs from /ml_results/*.json
// These results come from the Python ML training pipeline (scikit-learn, statsmodels)

const cache = {};

async function loadJSON(filename) {
  if (cache[filename]) return cache[filename];
  try {
    const res = await fetch(`/ml_results/${filename}`);
    if (!res.ok) throw new Error(`Failed to load ${filename}`);
    const data = await res.json();
    cache[filename] = data;
    return data;
  } catch (err) {
    console.warn(`ML results load failed: ${filename}`, err);
    return null;
  }
}

export async function loadTemporalResults() {
  return loadJSON('temporal.json');
}

export async function loadAnomalyResults() {
  return loadJSON('anomaly.json');
}

export async function loadClusteringResults() {
  return loadJSON('clustering.json');
}

export async function loadCorrelationResults() {
  return loadJSON('correlation.json');
}

export async function loadThresholdResults() {
  return loadJSON('threshold.json');
}
