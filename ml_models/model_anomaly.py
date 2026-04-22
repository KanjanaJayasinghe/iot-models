"""
=============================================================================
MODEL 2: Anomaly / Outlier Detection — ML-Driven Methods
=============================================================================
Techniques Used:
  1. Isolation Forest (sklearn) — tree-based unsupervised anomaly detector
  2. Local Outlier Factor (LOF) — density-based anomaly detection
  3. One-Class SVM — support vector anomaly boundary
  4. DBSCAN-Based Outlier Detection — density clustering for noise points
  5. Statistical Z-Score Baseline — for comparison with ML methods

Each model is trained per-sensor, and we compare ML anomaly detectors
against the simple z-score baseline to demonstrate ML improvement.

Links to IoT Buoy Use Case:
  - Detecting sensor malfunctions (stuck values, spikes)
  - Identifying unusual water quality events (pollution, algae bloom)
  - Flagging environmental anomalies for real-time dashboard alerts
=============================================================================
"""

import os
import json
import warnings
import numpy as np
import pandas as pd
import joblib

from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
from sklearn.svm import OneClassSVM
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    precision_score, recall_score, f1_score,
    confusion_matrix, classification_report,
)

warnings.filterwarnings("ignore")

# ─── Output Directory ─────────────────────────────────────────────────────────
MODEL_DIR = os.path.join(os.path.dirname(__file__), "trained_models", "anomaly")
os.makedirs(MODEL_DIR, exist_ok=True)


# ══════════════════════════════════════════════════════════════════════════════
# FEATURE ENGINEERING FOR ANOMALY DETECTION
# ══════════════════════════════════════════════════════════════════════════════
def create_anomaly_features(df: pd.DataFrame, value_col: str) -> np.ndarray:
    """
    Build feature matrix for anomaly detection.
    Features:
      - raw value (scaled)
      - first derivative (rate of change)
      - second derivative (acceleration)
      - rolling mean deviation (5-window)
      - rolling std (5-window)
      - local z-score (10-window)
    """
    values = df[value_col].values.astype(float)
    n = len(values)

    features = pd.DataFrame()
    features["value"] = values

    # First derivative (rate of change)
    features["diff_1"] = pd.Series(values).diff().fillna(0).values

    # Second derivative (acceleration of change)
    features["diff_2"] = pd.Series(values).diff().diff().fillna(0).values

    # Deviation from rolling mean
    rolling_mean = pd.Series(values).rolling(5, min_periods=1).mean()
    features["mean_deviation"] = (values - rolling_mean.values)

    # Rolling standard deviation
    features["rolling_std"] = (
        pd.Series(values).rolling(5, min_periods=1).std().fillna(0).values
    )

    # Local z-score (10-window)
    local_mean = pd.Series(values).rolling(10, min_periods=1).mean()
    local_std = pd.Series(values).rolling(10, min_periods=1).std().fillna(1)
    local_std = local_std.replace(0, 1)  # avoid division by zero
    features["local_zscore"] = ((values - local_mean.values) / local_std.values)

    return features.values


# ══════════════════════════════════════════════════════════════════════════════
# Z-SCORE BASELINE (for comparison)
# ══════════════════════════════════════════════════════════════════════════════
def zscore_baseline(values: np.ndarray, threshold: float = 2.5) -> np.ndarray:
    """Statistical z-score anomaly labels (1=anomaly, 0=normal)."""
    mean = np.mean(values)
    std = np.std(values)
    if std == 0:
        return np.zeros(len(values), dtype=int)
    z = np.abs((values - mean) / std)
    return (z > threshold).astype(int)


# ══════════════════════════════════════════════════════════════════════════════
# MODEL TRAINING
# ══════════════════════════════════════════════════════════════════════════════
def train_anomaly_models(df: pd.DataFrame, value_col: str, sensor_id: str) -> dict:
    """
    Train multiple anomaly detection models for a single sensor.

    Models:
      1. Isolation Forest
      2. Local Outlier Factor
      3. One-Class SVM
      4. DBSCAN-based outlier detection

    Uses z-score labels as pseudo ground truth for comparison metrics.
    """
    print(f"\n{'─' * 60}")
    print(f"  ANOMALY DETECTION — Sensor: {sensor_id.upper()}")
    print(f"{'─' * 60}")

    values = df[value_col].dropna().values.astype(float)
    if len(values) < 20:
        print(f"  [SKIP] Not enough data ({len(values)} points)")
        return {}

    # ── Feature Engineering ──
    X_features = create_anomaly_features(df, value_col)

    # ── Standardize features ──
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_features)                    # <── SCALING

    # ── Z-Score baseline labels (pseudo ground truth) ──
    z_labels = zscore_baseline(values, threshold=2.5)
    contamination_ratio = max(np.mean(z_labels), 0.01)
    contamination_ratio = min(contamination_ratio, 0.3)

    print(f"  Data points: {len(values)} | Features: {X_scaled.shape[1]}")
    print(f"  Z-score baseline anomalies: {z_labels.sum()} "
          f"({100 * z_labels.mean():.1f}%)")

    results = {}

    # ────────────────────────────────────────────────────────────────────────
    # MODEL 2A: Isolation Forest
    # ────────────────────────────────────────────────────────────────────────
    print(f"\n  [1] Isolation Forest")
    iso_forest = IsolationForest(
        n_estimators=200,
        contamination=contamination_ratio,
        max_samples="auto",
        random_state=42,
        n_jobs=-1,
    )
    iso_forest.fit(X_scaled)                                       # <── TRAINING STEP
    iso_pred = iso_forest.predict(X_scaled)                        # <── PREDICTION
    iso_labels = (iso_pred == -1).astype(int)                      # -1 = anomaly
    iso_scores = iso_forest.decision_function(X_scaled)            # anomaly scores

    iso_metrics = _compute_metrics(z_labels, iso_labels, "Isolation Forest")
    results["Isolation_Forest"] = {
        "metrics": iso_metrics,
        "n_anomalies": int(iso_labels.sum()),
        "anomaly_scores_sample": iso_scores[:20].tolist(),
    }

    # Save Isolation Forest model
    iso_path = os.path.join(MODEL_DIR, f"{sensor_id}_isolation_forest.joblib")
    joblib.dump({"model": iso_forest, "scaler": scaler}, iso_path)
    print(f"  Saved → {iso_path}")

    # ────────────────────────────────────────────────────────────────────────
    # MODEL 2B: Local Outlier Factor
    # ────────────────────────────────────────────────────────────────────────
    print(f"\n  [2] Local Outlier Factor (LOF)")
    lof = LocalOutlierFactor(
        n_neighbors=20,
        contamination=contamination_ratio,
        novelty=False,
    )
    lof_pred = lof.fit_predict(X_scaled)                           # <── TRAINING + PREDICTION
    lof_labels = (lof_pred == -1).astype(int)
    lof_scores = lof.negative_outlier_factor_

    lof_metrics = _compute_metrics(z_labels, lof_labels, "LOF")
    results["Local_Outlier_Factor"] = {
        "metrics": lof_metrics,
        "n_anomalies": int(lof_labels.sum()),
    }

    # Save LOF (novelty=True for future predictions)
    lof_novelty = LocalOutlierFactor(
        n_neighbors=20,
        contamination=contamination_ratio,
        novelty=True,
    )
    lof_novelty.fit(X_scaled)                                      # <── TRAINING STEP
    lof_path = os.path.join(MODEL_DIR, f"{sensor_id}_lof.joblib")
    joblib.dump({"model": lof_novelty, "scaler": scaler}, lof_path)
    print(f"  Saved → {lof_path}")

    # ────────────────────────────────────────────────────────────────────────
    # MODEL 2C: One-Class SVM
    # ────────────────────────────────────────────────────────────────────────
    print(f"\n  [3] One-Class SVM")
    oc_svm = OneClassSVM(
        kernel="rbf",
        gamma="scale",
        nu=contamination_ratio,
    )
    oc_svm.fit(X_scaled)                                           # <── TRAINING STEP
    svm_pred = oc_svm.predict(X_scaled)                            # <── PREDICTION
    svm_labels = (svm_pred == -1).astype(int)

    svm_metrics = _compute_metrics(z_labels, svm_labels, "One-Class SVM")
    results["OneClass_SVM"] = {
        "metrics": svm_metrics,
        "n_anomalies": int(svm_labels.sum()),
    }

    svm_path = os.path.join(MODEL_DIR, f"{sensor_id}_ocsvm.joblib")
    joblib.dump({"model": oc_svm, "scaler": scaler}, svm_path)
    print(f"  Saved → {svm_path}")

    # ────────────────────────────────────────────────────────────────────────
    # MODEL 2D: DBSCAN-Based Outlier Detection
    # ────────────────────────────────────────────────────────────────────────
    print(f"\n  [4] DBSCAN-Based Outlier Detection")
    dbscan = DBSCAN(
        eps=1.5,
        min_samples=5,
    )
    dbscan_labels_raw = dbscan.fit_predict(X_scaled)               # <── TRAINING + PREDICTION
    # DBSCAN: label -1 = noise/outlier
    dbscan_outliers = (dbscan_labels_raw == -1).astype(int)
    n_clusters = len(set(dbscan_labels_raw) - {-1})

    dbscan_metrics = _compute_metrics(z_labels, dbscan_outliers, "DBSCAN")
    results["DBSCAN"] = {
        "metrics": dbscan_metrics,
        "n_anomalies": int(dbscan_outliers.sum()),
        "n_clusters_found": n_clusters,
    }

    dbscan_path = os.path.join(MODEL_DIR, f"{sensor_id}_dbscan.joblib")
    joblib.dump({"model": dbscan, "scaler": scaler}, dbscan_path)
    print(f"  Saved → {dbscan_path}")

    # ── Summary Comparison Table ──
    print(f"\n  {'Model':>25s} | {'Anomalies':>9s} | {'Precision':>9s} | "
          f"{'Recall':>7s} | {'F1':>7s}")
    print(f"  {'─' * 25}-+-{'─' * 9}-+-{'─' * 9}-+-{'─' * 7}-+-{'─' * 7}")
    print(f"  {'Z-Score Baseline':>25s} | {z_labels.sum():>9d} |       — |     — |     —")
    for mname, mres in results.items():
        m = mres["metrics"]
        print(f"  {mname:>25s} | {mres['n_anomalies']:>9d} | "
              f"{m['precision']:>9.3f} | {m['recall']:>7.3f} | {m['f1']:>7.3f}")

    # Best model by F1
    best_name = max(results, key=lambda k: results[k]["metrics"]["f1"])
    print(f"\n  ★ Best Anomaly Detector: {best_name} "
          f"(F1={results[best_name]['metrics']['f1']:.3f})")

    return {
        "sensor": sensor_id,
        "n_samples": len(values),
        "z_score_anomalies": int(z_labels.sum()),
        "contamination_ratio": float(contamination_ratio),
        "best_model": best_name,
        "models": results,
    }


def _compute_metrics(y_true: np.ndarray, y_pred: np.ndarray, name: str) -> dict:
    """Compute precision, recall, F1 for anomaly detection."""
    if y_true.sum() == 0 and y_pred.sum() == 0:
        return {"precision": 1.0, "recall": 1.0, "f1": 1.0}
    if y_true.sum() == 0:
        return {"precision": 0.0, "recall": 0.0, "f1": 0.0}

    p = precision_score(y_true, y_pred, zero_division=0)
    r = recall_score(y_true, y_pred, zero_division=0)
    f = f1_score(y_true, y_pred, zero_division=0)

    print(f"    Precision={p:.3f}  Recall={r:.3f}  F1={f:.3f}  "
          f"Detected={y_pred.sum()}")
    return {"precision": float(p), "recall": float(r), "f1": float(f)}


# ══════════════════════════════════════════════════════════════════════════════
# RUN ALL ANOMALY MODELS FOR ALL SENSORS
# ══════════════════════════════════════════════════════════════════════════════
def run_anomaly_detection(all_data: dict, value_cols: dict) -> dict:
    """Run anomaly detection for all sensors."""
    print("\n" + "=" * 60)
    print("  MODEL 2: ANOMALY / OUTLIER DETECTION")
    print("  ML-Driven Methods (Isolation Forest, LOF, SVM, DBSCAN)")
    print("=" * 60)

    all_results = {}
    for sensor_id, df in all_data.items():
        if df.empty:
            continue
        val_col = value_cols.get(sensor_id)
        if val_col is None or val_col not in df.columns:
            continue

        result = train_anomaly_models(df, val_col, sensor_id)
        if result:
            all_results[sensor_id] = result

    # Save summary
    summary_path = os.path.join(MODEL_DIR, "anomaly_summary.json")
    with open(summary_path, "w") as f:
        json.dump(all_results, f, indent=2, default=str)
    print(f"\n  Summary saved → {summary_path}")

    return all_results
