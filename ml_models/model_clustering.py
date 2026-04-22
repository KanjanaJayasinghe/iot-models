"""
=============================================================================
MODEL 5: Behavior Pattern Analysis — Unsupervised Clustering
=============================================================================
Techniques Used:
  1. K-Means Clustering (sklearn) — partition-based clustering
  2. Gaussian Mixture Model Clustering — probabilistic soft clustering
  3. Agglomerative Hierarchical Clustering — tree-based merging
  4. Silhouette Analysis — optimal K selection
  5. Multi-dimensional clustering — using all sensor features together

Instead of single-sensor 1D clustering, we perform multi-dimensional
clustering across ALL sensors simultaneously to discover system-wide
water quality behavior patterns.

Links to IoT Buoy Use Case:
  - Discover recurring water quality patterns (e.g., "calm morning", "turbid afternoon")
  - Identify distinct environmental states of the water body
  - Group similar readings for pattern-based alerting
  - Understand operational regimes of the IoT buoy environment
=============================================================================
"""

import os
import json
import warnings
import numpy as np
import pandas as pd
import joblib

from sklearn.cluster import KMeans, AgglomerativeClustering
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    silhouette_score, calinski_harabasz_score, davies_bouldin_score,
)

warnings.filterwarnings("ignore")

# ─── Output Directory ─────────────────────────────────────────────────────────
MODEL_DIR = os.path.join(os.path.dirname(__file__), "trained_models", "clustering")
os.makedirs(MODEL_DIR, exist_ok=True)


# ══════════════════════════════════════════════════════════════════════════════
# STEP 1: OPTIMAL K SELECTION (SILHOUETTE + ELBOW)
# ══════════════════════════════════════════════════════════════════════════════
def find_optimal_k(x_scaled: np.ndarray, k_range: range = range(2, 8)) -> dict:
    """
    Find optimal number of clusters using:
      - Silhouette Score (higher = better)
      - Calinski-Harabasz Index (higher = better)
      - Davies-Bouldin Index (lower = better)
      - Inertia / Elbow method
    """
    print(f"\n  Optimal K Selection (range={list(k_range)}):")
    print(f"    {'K':>3s} | {'Silhouette':>10s} | {'Calinski-H':>10s} | "
          f"{'Davies-B':>10s} | {'Inertia':>10s}")
    print(f"    {'─' * 3}-+-{'─' * 10}-+-{'─' * 10}-+-{'─' * 10}-+-{'─' * 10}")

    metrics = []
    for k in k_range:
        km = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = km.fit_predict(x_scaled)

        sil = silhouette_score(x_scaled, labels, random_state=42)
        ch = calinski_harabasz_score(x_scaled, labels)
        db = davies_bouldin_score(x_scaled, labels)
        inertia = km.inertia_

        metrics.append({
            "k": k, "silhouette": sil, "calinski_harabasz": ch,
            "davies_bouldin": db, "inertia": inertia,
        })

        print(f"    {k:>3d} | {sil:>10.3f} | {ch:>10.1f} | {db:>10.3f} | {inertia:>10.1f}")

    # Best K by silhouette score
    best = max(metrics, key=lambda x: x["silhouette"])
    print(f"\n    ★ Optimal K = {best['k']} (Silhouette = {best['silhouette']:.3f})")

    return {"metrics": metrics, "optimal_k": best["k"]}


# ══════════════════════════════════════════════════════════════════════════════
# STEP 2: K-MEANS CLUSTERING
# ══════════════════════════════════════════════════════════════════════════════
def train_kmeans(x_scaled: np.ndarray, k: int, sensor_names: list) -> dict:
    """
    Train K-Means clustering model.
    """
    print(f"\n  [K-Means] Training with K={k}...")

    # ── MODEL TRAINING ──
    kmeans = KMeans(
        n_clusters=k,
        random_state=42,
        n_init=20,
        max_iter=300,
    )
    labels = kmeans.fit_predict(x_scaled)                          # <── TRAINING STEP

    # Cluster centroids (in scaled space)
    centroids = kmeans.cluster_centers_

    # Evaluation metrics
    sil = silhouette_score(x_scaled, labels, random_state=42)
    ch = calinski_harabasz_score(x_scaled, labels)
    db = davies_bouldin_score(x_scaled, labels)

    print(f"    Silhouette={sil:.3f}  Calinski-Harabasz={ch:.1f}  "
          f"Davies-Bouldin={db:.3f}")

    # Cluster distribution
    unique, counts = np.unique(labels, return_counts=True)
    print(f"    Cluster sizes: {dict(zip(unique.tolist(), counts.tolist()))}")

    # Centroid interpretation
    print("\n    Cluster Centroids (standardized):")
    for i in range(k):
        vals = ", ".join(f"{sensor_names[j]}={centroids[i, j]:.2f}"
                        for j in range(len(sensor_names)))
        print(f"      Cluster {i}: {vals}")

    return {
        "model": kmeans,
        "labels": labels,
        "centroids": centroids.tolist(),
        "silhouette": float(sil),
        "calinski_harabasz": float(ch),
        "davies_bouldin": float(db),
        "cluster_sizes": dict(zip(unique.tolist(), counts.tolist())),
    }


# ══════════════════════════════════════════════════════════════════════════════
# STEP 3: GAUSSIAN MIXTURE CLUSTERING
# ══════════════════════════════════════════════════════════════════════════════
def train_gmm_clustering(x_scaled: np.ndarray, k: int, sensor_names: list) -> dict:
    """
    Train Gaussian Mixture Model for soft (probabilistic) clustering.
    Unlike K-Means, GMM provides probability of belonging to each cluster.
    """
    print(f"\n  [GMM Clustering] Training with K={k}...")

    # ── MODEL TRAINING ──
    gmm = GaussianMixture(
        n_components=k,
        covariance_type="full",
        random_state=42,
        n_init=10,
        max_iter=200,
    )
    gmm.fit(x_scaled)                                              # <── TRAINING STEP

    labels = gmm.predict(x_scaled)                                 # <── HARD ASSIGNMENT
    probs = gmm.predict_proba(x_scaled)                            # <── SOFT ASSIGNMENT

    # Evaluation
    sil = silhouette_score(x_scaled, labels, random_state=42)
    bic = gmm.bic(x_scaled.astype(np.float64))
    aic = gmm.aic(x_scaled.astype(np.float64))

    print(f"    Silhouette={sil:.3f}  BIC={bic:.1f}  AIC={aic:.1f}")

    # Cluster distribution
    unique, counts = np.unique(labels, return_counts=True)
    print(f"    Cluster sizes: {dict(zip(unique.tolist(), counts.tolist()))}")

    # Average assignment confidence
    max_probs = probs.max(axis=1)
    print(f"    Avg assignment confidence: {max_probs.mean():.3f}")

    # Means
    means_arr = np.asarray(gmm.means_)
    print("\n    GMM Component Means (standardized):")
    for i in range(k):
        vals = ", ".join(f"{sensor_names[j]}={means_arr[i, j]:.2f}"
                        for j in range(len(sensor_names)))
        print(f"      Component {i}: {vals}")

    return {
        "model": gmm,
        "labels": labels,
        "means": means_arr.tolist(),
        "silhouette": float(sil),
        "bic": float(bic),
        "aic": float(aic),
        "cluster_sizes": dict(zip(unique.tolist(), counts.tolist())),
        "avg_confidence": float(max_probs.mean()),
    }


# ══════════════════════════════════════════════════════════════════════════════
# STEP 4: HIERARCHICAL CLUSTERING
# ══════════════════════════════════════════════════════════════════════════════
def train_hierarchical(x_scaled: np.ndarray, k: int) -> dict:
    """
    Train Agglomerative Hierarchical Clustering.
    Uses Ward linkage (minimizes variance within clusters).
    """
    print(f"\n  [Hierarchical Clustering] Training with K={k}...")

    # ── MODEL TRAINING ──
    agg = AgglomerativeClustering(
        n_clusters=k,
        linkage="ward",
    )
    labels = agg.fit_predict(x_scaled)                             # <── TRAINING STEP

    # Evaluation
    sil = silhouette_score(x_scaled, labels, random_state=42)
    ch = calinski_harabasz_score(x_scaled, labels)
    db = davies_bouldin_score(x_scaled, labels)

    print(f"    Silhouette={sil:.3f}  Calinski-Harabasz={ch:.1f}  "
          f"Davies-Bouldin={db:.3f}")

    unique, counts = np.unique(labels, return_counts=True)
    print(f"    Cluster sizes: {dict(zip(unique.tolist(), counts.tolist()))}")

    return {
        "model": agg,
        "labels": labels,
        "silhouette": float(sil),
        "calinski_harabasz": float(ch),
        "davies_bouldin": float(db),
        "cluster_sizes": dict(zip(unique.tolist(), counts.tolist())),
    }


# ══════════════════════════════════════════════════════════════════════════════
# STEP 5: BEHAVIOR PATTERN INTERPRETATION
# ══════════════════════════════════════════════════════════════════════════════
def interpret_clusters(x_original: np.ndarray, labels: np.ndarray,
                       sensor_names: list) -> dict:
    """
    Interpret cluster centers in ORIGINAL (unscaled) units for
    meaningful behavior pattern descriptions.
    """
    print("\n  Behavior Pattern Interpretation:")
    patterns = {}

    for cluster_id in sorted(set(labels)):
        mask = labels == cluster_id
        cluster_data = x_original[mask]

        profile = {}
        for j, sensor in enumerate(sensor_names):
            vals = cluster_data[:, j]
            profile[sensor] = {
                "mean": float(np.mean(vals)),
                "std": float(np.std(vals)),
                "min": float(np.min(vals)),
                "max": float(np.max(vals)),
            }

        # Auto-generate human-readable description
        dominant = max(profile.items(), key=lambda x: abs(x[1]["mean"]))
        size = int(mask.sum())

        patterns[f"pattern_{cluster_id}"] = {
            "size": size,
            "percentage": float(size / len(labels) * 100),
            "profile": profile,
            "dominant_sensor": dominant[0],
        }

        print(f"\n    Pattern {cluster_id} ({size} readings, "
              f"{size / len(labels) * 100:.1f}%):")
        for sensor, stats in profile.items():
            print(f"      {sensor:>15s}: mean={stats['mean']:.2f} ± {stats['std']:.2f} "
                  f"[{stats['min']:.2f}, {stats['max']:.2f}]")

    return patterns


# ══════════════════════════════════════════════════════════════════════════════
# PER-SENSOR CLUSTERING (for dashboard per-sensor cluster charts)
# ══════════════════════════════════════════════════════════════════════════════
def _select_best_k(x_scaled: np.ndarray, n_values: int) -> tuple:
    """Select best K for single-sensor clustering via silhouette score."""
    best_k, best_sil = 3, -1.0
    for k in range(2, 6):
        if k >= n_values:
            continue
        km = KMeans(n_clusters=k, random_state=42, n_init=10)
        labs = km.fit_predict(x_scaled)
        if len(set(labs)) < 2:
            continue
        sil = silhouette_score(x_scaled, labs, random_state=42)
        if sil > best_sil:
            best_sil = sil
            best_k = k
    return best_k, best_sil


def train_per_sensor_clustering(all_data: dict, value_cols: dict) -> dict:
    """
    Train K-Means clustering on each individual sensor for behavior
    pattern discovery (Low / Medium / High behavior zones).
    """
    print(f"\n{'─' * 60}")
    print("  PER-SENSOR CLUSTERING")
    print(f"{'─' * 60}")

    results = {}
    for sensor_id, df in all_data.items():
        if df.empty:
            continue
        val_col = value_cols.get(sensor_id)
        if val_col is None or val_col not in df.columns:
            continue

        values = df[val_col].dropna().values.reshape(-1, 1).astype(float)
        if len(values) < 10:
            continue

        print(f"\n  {sensor_id.upper()}:")

        scaler = StandardScaler()
        x_scaled = scaler.fit_transform(values)

        # Optimal K via silhouette (2-5)
        best_k, best_sil = _select_best_k(x_scaled, len(values))

        # Train final model
        km = KMeans(n_clusters=best_k, random_state=42, n_init=20)
        labels = km.fit_predict(x_scaled)                          # <── TRAINING STEP

        # Sort clusters by centroid value
        centroid_means = scaler.inverse_transform(km.cluster_centers_).flatten()
        sorted_idx = np.argsort(centroid_means)
        label_names = {sorted_idx[0]: "Low"}
        label_names[sorted_idx[-1]] = "High"
        for idx in sorted_idx[1:-1]:
            label_names[idx] = "Medium"

        unique, counts = np.unique(labels, return_counts=True)
        for cl, cnt in zip(unique, counts):
            print(f"    Cluster '{label_names[cl]}': {cnt} readings "
                  f"(centroid={centroid_means[cl]:.2f})")

        model_path = os.path.join(MODEL_DIR, f"{sensor_id}_kmeans.joblib")
        joblib.dump({
            "model": km, "scaler": scaler, "label_names": label_names,
            "centroids_original": centroid_means.tolist(),
        }, model_path)
        print(f"    Saved → {model_path}")

        results[sensor_id] = {
            "optimal_k": best_k,
            "silhouette": float(best_sil),
            "centroids": centroid_means.tolist(),
            "label_names": {str(k): v for k, v in label_names.items()},
            "cluster_sizes": dict(zip(unique.tolist(), counts.tolist())),
            "model_path": model_path,
        }

    return results


# ══════════════════════════════════════════════════════════════════════════════
# RUN ALL CLUSTERING ANALYSIS
# ══════════════════════════════════════════════════════════════════════════════
def run_clustering_analysis(merged_df: pd.DataFrame, sensor_ids: list,
                            all_data: dict, value_cols: dict) -> dict:
    """Run complete behavior pattern clustering analysis."""
    print("\n" + "=" * 60)
    print("  MODEL 5: BEHAVIOR PATTERN ANALYSIS")
    print("  Unsupervised Clustering (K-Means, GMM, Hierarchical)")
    print("=" * 60)

    available = [s for s in sensor_ids if s in merged_df.columns]
    df = merged_df[available].dropna()

    if len(df) < 20:
        print("  [SKIP] Not enough merged data for multi-sensor clustering")
        return {}

    x_original = df.values
    sensor_names = available

    # Standardize
    scaler = StandardScaler()
    x_scaled = scaler.fit_transform(x_original)                    # <── SCALING

    print(f"  Data: {x_scaled.shape[0]} samples × {x_scaled.shape[1]} sensors")

    # ── Optimal K Selection ──
    k_analysis = find_optimal_k(x_scaled)
    optimal_k = k_analysis["optimal_k"]

    # ── K-Means ──
    kmeans_result = train_kmeans(x_scaled, optimal_k, sensor_names)

    # ── GMM Clustering ──
    gmm_result = train_gmm_clustering(x_scaled, optimal_k, sensor_names)

    # ── Hierarchical Clustering ──
    hier_result = train_hierarchical(x_scaled, optimal_k)

    # ── Model Comparison ──
    print(f"\n{'─' * 60}")
    print("  CLUSTERING MODEL COMPARISON")
    print(f"{'─' * 60}")
    print(f"    {'Model':>20s} | {'Silhouette':>10s}")
    print(f"    {'─' * 20}-+-{'─' * 10}")
    print(f"    {'K-Means':>20s} | {kmeans_result['silhouette']:>10.3f}")
    print(f"    {'GMM':>20s} | {gmm_result['silhouette']:>10.3f}")
    print(f"    {'Hierarchical':>20s} | {hier_result['silhouette']:>10.3f}")

    # Best model
    models = {"K-Means": kmeans_result, "GMM": gmm_result, "Hierarchical": hier_result}
    best_name = max(models, key=lambda k: models[k]["silhouette"])
    best_result = models[best_name]
    print(f"\n    ★ Best Clustering Model: {best_name} "
          f"(Silhouette={best_result['silhouette']:.3f})")

    # ── Interpret Best Clusters ──
    patterns = interpret_clusters(x_original, best_result["labels"], sensor_names)

    # Save best model
    best_model_path = os.path.join(MODEL_DIR, "best_multi_sensor_clustering.joblib")
    joblib.dump({
        "model": best_result["model"],
        "scaler": scaler,
        "method": best_name,
        "sensor_names": sensor_names,
        "optimal_k": optimal_k,
    }, best_model_path)
    print(f"\n  Best model saved → {best_model_path}")

    # ── Per-Sensor Clustering ──
    per_sensor = train_per_sensor_clustering(all_data, value_cols)

    all_results = {
        "optimal_k_analysis": k_analysis,
        "kmeans": {k: v for k, v in kmeans_result.items() if k != "model"},
        "gmm": {k: v for k, v in gmm_result.items() if k != "model"},
        "hierarchical": {k: v for k, v in hier_result.items() if k != "model"},
        "best_method": best_name,
        "behavior_patterns": patterns,
        "per_sensor": per_sensor,
        "n_samples": len(df),
    }

    # Save summary
    summary_path = os.path.join(MODEL_DIR, "clustering_summary.json")

    def convert(obj):
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        return str(obj)

    with open(summary_path, "w") as f:
        json.dump(all_results, f, indent=2, default=convert)
    print(f"\n  Summary saved → {summary_path}")

    return all_results
