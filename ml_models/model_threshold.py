"""
=============================================================================
MODEL 3: Threshold-Based Alerts — ML-Learned Classification
=============================================================================
Techniques Used:
  1. Gaussian Mixture Model (GMM) — learn distribution-based thresholds
  2. K-Means for threshold boundary learning
  3. Decision Tree Classifier — interpretable threshold rules
  4. Random Forest Classifier — ensemble threshold classification

Instead of hard-coded thresholds, we TRAIN models to learn what constitutes
"normal", "warning", and "danger" readings from the sensor data distribution.

Links to IoT Buoy Use Case:
  - Automatically determine safe ranges for water quality parameters
  - Generate alerts when readings enter ML-predicted danger zones
  - Adapt thresholds as sensor behavior changes over time
=============================================================================
"""

import os
import json
import warnings
import numpy as np
import pandas as pd
import joblib

from sklearn.mixture import GaussianMixture
from sklearn.cluster import KMeans
from sklearn.tree import DecisionTreeClassifier, export_text
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score, StratifiedKFold
from sklearn.metrics import classification_report, accuracy_score
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore")

# ─── Output Directory ─────────────────────────────────────────────────────────
MODEL_DIR = os.path.join(os.path.dirname(__file__), "trained_models", "threshold")
os.makedirs(MODEL_DIR, exist_ok=True)


# ══════════════════════════════════════════════════════════════════════════════
# STEP 1: LEARN THRESHOLDS USING GAUSSIAN MIXTURE MODEL
# ══════════════════════════════════════════════════════════════════════════════
def learn_thresholds_gmm(values: np.ndarray, sensor_id: str) -> dict:
    """
    Use a 3-component Gaussian Mixture Model to learn natural
    data boundaries for Normal / Warning / Danger zones.

    The GMM discovers the underlying distribution clusters in the data
    and assigns threshold boundaries between them.
    """
    print(f"\n  [GMM] Learning thresholds for {sensor_id}...")

    X = values.reshape(-1, 1)

    # ── MODEL TRAINING (GMM with 3 components) ──
    gmm = GaussianMixture(
        n_components=3,
        covariance_type="full",
        random_state=42,
        n_init=10,
        max_iter=200,
    )
    gmm.fit(X)                                                     # <── TRAINING STEP

    # ── PREDICTION ──
    labels = gmm.predict(X)                                        # <── PREDICTION
    probs = gmm.predict_proba(X)                                   # <── SOFT PREDICTION

    # Sort components by mean to get Low < Medium < High
    means = gmm.means_.flatten()
    sorted_idx = np.argsort(means)
    label_map = {sorted_idx[0]: "normal", sorted_idx[1]: "warning", sorted_idx[2]: "danger"}

    # If means are very close (e.g., 3 overlapping), reassign
    if len(sorted_idx) == 3:
        # Relabel: lowest-mean cluster = normal, middle = warning, highest = danger
        # (swap if sensor has inverted logic, e.g., pH too low is also dangerous)
        pass

    zone_labels = np.array([label_map.get(l, "normal") for l in labels])

    # Compute learned threshold boundaries (between cluster means)
    sorted_means = np.sort(means)
    sorted_stds = np.sqrt(np.sort(gmm.covariances_.flatten()))

    # Boundaries at midpoints between adjacent means
    thresholds = {
        "warning_low": float(sorted_means[0] + (sorted_means[1] - sorted_means[0]) * 0.5),
        "warning_high": float(sorted_means[1] + (sorted_means[2] - sorted_means[1]) * 0.5),
        "component_means": sorted_means.tolist(),
        "component_stds": sorted_stds.tolist(),
        "bic": float(gmm.bic(X)),
        "aic": float(gmm.aic(X)),
    }

    zone_counts = {z: int((zone_labels == z).sum()) for z in ["normal", "warning", "danger"]}
    print(f"    Zones: {zone_counts}")
    print(f"    Learned boundaries: warning<{thresholds['warning_low']:.2f}, "
          f"danger>{thresholds['warning_high']:.2f}")
    print(f"    BIC={thresholds['bic']:.1f}  AIC={thresholds['aic']:.1f}")

    # Save GMM model
    gmm_path = os.path.join(MODEL_DIR, f"{sensor_id}_gmm.joblib")
    joblib.dump(gmm, gmm_path)
    print(f"    Saved → {gmm_path}")

    return {
        "method": "GMM",
        "thresholds": thresholds,
        "zone_counts": zone_counts,
        "model_path": gmm_path,
    }


# ══════════════════════════════════════════════════════════════════════════════
# STEP 2: GENERATE TRAINING LABELS USING GMM-LEARNED THRESHOLDS
# ══════════════════════════════════════════════════════════════════════════════
def generate_labels(values: np.ndarray, thresholds: dict) -> np.ndarray:
    """Convert continuous values to class labels using GMM-learned thresholds."""
    labels = np.full(len(values), "normal", dtype=object)
    wl = thresholds["warning_low"]
    wh = thresholds["warning_high"]
    labels[values > wh] = "danger"
    labels[(values > wl) & (values <= wh) & (values > np.median(values))] = "warning"
    labels[values < (np.mean(values) - 2 * np.std(values))] = "danger"
    return labels


# ══════════════════════════════════════════════════════════════════════════════
# STEP 3: TRAIN SUPERVISED CLASSIFIERS ON LEARNED LABELS
# ══════════════════════════════════════════════════════════════════════════════
def create_classification_features(values: np.ndarray) -> np.ndarray:
    """Build feature matrix for threshold classification."""
    s = pd.Series(values)
    features = pd.DataFrame()
    features["value"] = values
    features["diff_1"] = s.diff().fillna(0).values
    features["rolling_mean_5"] = s.rolling(5, min_periods=1).mean().values
    features["rolling_std_5"] = s.rolling(5, min_periods=1).std().fillna(0).values
    features["rolling_mean_10"] = s.rolling(10, min_periods=1).mean().values
    features["deviation_from_mean"] = (values - np.mean(values))
    features["ema_5"] = s.ewm(span=5, adjust=False).mean().values
    return features.values


def train_threshold_classifiers(df: pd.DataFrame, value_col: str,
                                 sensor_id: str) -> dict:
    """
    Train supervised classifiers to predict Normal/Warning/Danger status.

    Pipeline:
      1. Learn thresholds from GMM (unsupervised)
      2. Generate training labels from GMM thresholds
      3. Train Decision Tree & Random Forest classifiers
      4. Evaluate with cross-validation
    """
    print(f"\n{'─' * 60}")
    print(f"  THRESHOLD CLASSIFICATION — Sensor: {sensor_id.upper()}")
    print(f"{'─' * 60}")

    values = df[value_col].dropna().values.astype(float)
    if len(values) < 30:
        print(f"  [SKIP] Not enough data ({len(values)} points)")
        return {}

    # ── Step 1: Learn thresholds via GMM ──
    gmm_result = learn_thresholds_gmm(values, sensor_id)

    # ── Step 2: Generate labels ──
    labels = generate_labels(values, gmm_result["thresholds"])
    label_counts = {l: int((labels == l).sum()) for l in ["normal", "warning", "danger"]}
    print(f"\n  Training labels: {label_counts}")

    # ── Step 3: Feature engineering ──
    X = create_classification_features(values)
    y = labels

    # Encode labels
    label_to_int = {"normal": 0, "warning": 1, "danger": 2}
    y_encoded = np.array([label_to_int[l] for l in y])

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    results = {}

    # ────────────────────────────────────────────────────────────────────────
    # MODEL 3A: Decision Tree Classifier
    # ────────────────────────────────────────────────────────────────────────
    print(f"\n  [Decision Tree] Training...")
    dt = DecisionTreeClassifier(
        max_depth=5,
        min_samples_split=10,
        min_samples_leaf=5,
        random_state=42,
        class_weight="balanced",
    )

    # Cross-validation
    n_classes = len(set(y_encoded))
    min_class_count = min((v for v in label_counts.values() if v > 0), default=5)
    n_splits = max(2, min(5, min_class_count))
    if n_classes >= 2:
        cv = StratifiedKFold(n_splits=n_splits,
                             shuffle=True, random_state=42)
        try:
            dt_scores = cross_val_score(dt, X_scaled, y_encoded, cv=cv,
                                        scoring="f1_macro")  # <── CV EVALUATION
            print(f"    CV F1-macro: {dt_scores.mean():.3f} ± {dt_scores.std():.3f}")
        except Exception:
            dt_scores = np.array([0.0])

    # ── FINAL TRAINING on full data ──
    dt.fit(X_scaled, y_encoded)                                    # <── TRAINING STEP
    dt_pred = dt.predict(X_scaled)                                 # <── PREDICTION

    # Print learned rules
    feature_names = ["value", "diff_1", "rolling_mean_5", "rolling_std_5",
                     "rolling_mean_10", "deviation", "ema_5"]
    tree_rules = export_text(dt, feature_names=feature_names, max_depth=3)
    print(f"\n  Decision Tree Rules (top 3 levels):\n{tree_rules}")

    dt_path = os.path.join(MODEL_DIR, f"{sensor_id}_decision_tree.joblib")
    joblib.dump({"model": dt, "scaler": scaler, "label_map": label_to_int}, dt_path)
    print(f"    Saved → {dt_path}")

    dt_acc = accuracy_score(y_encoded, dt_pred)
    results["Decision_Tree"] = {
        "accuracy": float(dt_acc),
        "cv_f1_mean": float(dt_scores.mean()) if n_classes >= 2 else 0.0,
        "model_path": dt_path,
    }

    # ────────────────────────────────────────────────────────────────────────
    # MODEL 3B: Random Forest Classifier
    # ────────────────────────────────────────────────────────────────────────
    print(f"\n  [Random Forest] Training...")
    rf = RandomForestClassifier(
        n_estimators=100,
        max_depth=8,
        min_samples_split=5,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )

    if n_classes >= 2:
        try:
            rf_scores = cross_val_score(rf, X_scaled, y_encoded, cv=cv,
                                        scoring="f1_macro")  # <── CV EVALUATION
            print(f"    CV F1-macro: {rf_scores.mean():.3f} ± {rf_scores.std():.3f}")
        except Exception:
            rf_scores = np.array([0.0])

    # ── FINAL TRAINING on full data ──
    rf.fit(X_scaled, y_encoded)                                    # <── TRAINING STEP
    rf_pred = rf.predict(X_scaled)                                 # <── PREDICTION

    # Feature importance
    importances = rf.feature_importances_
    print(f"\n  Feature Importances:")
    for fname, imp in sorted(zip(feature_names, importances), key=lambda x: -x[1]):
        bar = "█" * int(imp * 40)
        print(f"    {fname:>20s}: {imp:.3f} {bar}")

    rf_path = os.path.join(MODEL_DIR, f"{sensor_id}_random_forest_threshold.joblib")
    joblib.dump({"model": rf, "scaler": scaler, "label_map": label_to_int}, rf_path)
    print(f"    Saved → {rf_path}")

    rf_acc = accuracy_score(y_encoded, rf_pred)
    results["Random_Forest"] = {
        "accuracy": float(rf_acc),
        "cv_f1_mean": float(rf_scores.mean()) if n_classes >= 2 else 0.0,
        "feature_importances": dict(zip(feature_names, importances.tolist())),
        "model_path": rf_path,
    }

    # ── Classification Report ──
    int_to_label = {v: k for k, v in label_to_int.items()}
    target_names = [int_to_label[i] for i in sorted(set(y_encoded))]
    print(f"\n  Classification Report (Random Forest on full data):")
    print(classification_report(y_encoded, rf_pred, target_names=target_names))

    # Best classifier
    best = max(results, key=lambda k: results[k].get("cv_f1_mean", 0))
    print(f"  ★ Best Classifier: {best} (CV F1={results[best]['cv_f1_mean']:.3f})")

    return {
        "sensor": sensor_id,
        "n_samples": len(values),
        "gmm_thresholds": gmm_result,
        "label_distribution": label_counts,
        "classifiers": results,
        "best_classifier": best,
    }


# ══════════════════════════════════════════════════════════════════════════════
# RUN ALL THRESHOLD MODELS FOR ALL SENSORS
# ══════════════════════════════════════════════════════════════════════════════
def run_threshold_analysis(all_data: dict, value_cols: dict) -> dict:
    """Run threshold classification for all sensors."""
    print("\n" + "=" * 60)
    print("  MODEL 3: THRESHOLD-BASED ALERTS")
    print("  ML-Learned Classification (GMM + Decision Tree + Random Forest)")
    print("=" * 60)

    all_results = {}
    for sensor_id, df in all_data.items():
        if df.empty:
            continue
        val_col = value_cols.get(sensor_id)
        if val_col is None or val_col not in df.columns:
            continue

        result = train_threshold_classifiers(df, val_col, sensor_id)
        if result:
            all_results[sensor_id] = result

    # Save summary
    summary_path = os.path.join(MODEL_DIR, "threshold_summary.json")
    with open(summary_path, "w") as f:
        json.dump(all_results, f, indent=2, default=str)
    print(f"\n  Summary saved → {summary_path}")

    return all_results
