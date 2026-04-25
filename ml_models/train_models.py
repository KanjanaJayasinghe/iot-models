"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                 IoT BUOY — ML MODEL TRAINING PIPELINE                       ║
║                                                                             ║
║  Project: IoT Water Quality Monitoring Buoy                                 ║
║  Database: Firebase Realtime Database                                       ║
║  Sensors: Turbidity, pH, Temperature, TDS, Light, Motion (Axis)             ║
║                                                                             ║
║  This script runs the COMPLETE ML training pipeline:                        ║
║                                                                             ║
║    MODEL 1: Temporal Trend Analysis                                         ║
║             → Linear Regression, Polynomial Regression,                     ║
║               Random Forest, Gradient Boosting, Holt-Winters                ║
║                                                                             ║
║    MODEL 2: Anomaly / Outlier Detection                                     ║
║             → Isolation Forest, LOF, One-Class SVM, DBSCAN                  ║
║                                                                             ║
║    MODEL 3: Threshold-Based Alert Classification                            ║
║             → GMM threshold learning, Decision Tree, Random Forest          ║
║                                                                             ║
║    MODEL 4: Correlation & Feature Importance                                ║
║             → RF/GB feature importance, Mutual Information, PCA             ║
║                                                                             ║
║    MODEL 5: Behavior Pattern Clustering                                     ║
║             → K-Means, GMM Clustering, Hierarchical, Silhouette Analysis    ║
║                                                                             ║
║  All trained models are saved as .joblib files in trained_models/           ║
║  Summary JSON reports are generated per analysis type                       ║
╚═══════════════════════════════════════════════════════════════════════════════╝

Usage:
    python train_models.py

Prerequisites:
    pip install -r requirements.txt
"""

import os
import sys
import json
import time
import shutil
import numpy as np

# ─── Add current directory to path ────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(__file__))

from fetch_data import (
    fetch_all_sensors,
    get_primary_value_column,
    build_merged_dataframe,
    SENSOR_CONFIG,
)
from model_temporal import run_temporal_analysis
from model_anomaly import run_anomaly_detection
from model_threshold import run_threshold_analysis
from model_correlation import run_correlation_analysis
from model_clustering import run_clustering_analysis


GENERATED_MODEL_SUBDIRS = [
    "temporal",
    "anomaly",
    "threshold",
    "correlation",
    "clustering",
]


def clear_generated_artifacts(model_dir: str) -> None:
    """Remove generated model artifacts from previous runs."""
    print("\n  Clearing generated model artifacts from previous run...")

    for subdir in GENERATED_MODEL_SUBDIRS:
        subdir_path = os.path.join(model_dir, subdir)
        os.makedirs(subdir_path, exist_ok=True)
        removed = 0

        for name in os.listdir(subdir_path):
            path = os.path.join(subdir_path, name)
            if os.path.isfile(path):
                os.remove(path)
                removed += 1

        print(f"    {subdir}: removed {removed} files")

    summary_path = os.path.join(model_dir, "training_summary.json")
    if os.path.exists(summary_path):
        os.remove(summary_path)
        print("    training_summary.json: removed")


def main():
    overall_start = time.time()
    model_dir = os.path.join(os.path.dirname(__file__), "trained_models")

    print("╔" + "═" * 68 + "╗")
    print("║   IoT BUOY — COMPLETE ML MODEL TRAINING PIPELINE" + " " * 18 + "║")
    print("╚" + "═" * 68 + "╝")

    clear_generated_artifacts(model_dir)

    # ══════════════════════════════════════════════════════════════════════════
    # PHASE 1: DATA COLLECTION FROM FIREBASE
    # ══════════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 60)
    print("  PHASE 1: FETCHING DATA FROM FIREBASE RTDB")
    print("=" * 60)

    all_data = fetch_all_sensors()

    # Determine primary value column for each sensor
    value_cols = {}
    for sensor_id, df in all_data.items():
        if not df.empty:
            value_cols[sensor_id] = get_primary_value_column(df, sensor_id)

    print(f"\n  Sensors loaded: {list(value_cols.keys())}")
    print(f"  Value columns: {value_cols}")

    # Build merged multi-sensor DataFrame
    merged_df = build_merged_dataframe(all_data)
    print(f"  Merged DataFrame: {merged_df.shape[0]} rows × {merged_df.shape[1]} columns")

    sensor_ids = list(SENSOR_CONFIG.keys())

    # ══════════════════════════════════════════════════════════════════════════
    # PHASE 2: MODEL TRAINING
    # ══════════════════════════════════════════════════════════════════════════

    # ── MODEL 1: Temporal Trend Analysis ──────────────────────────────────────
    t1 = time.time()
    temporal_results = run_temporal_analysis(all_data, value_cols)
    t1_elapsed = time.time() - t1

    # ── MODEL 2: Anomaly Detection ────────────────────────────────────────────
    t2 = time.time()
    anomaly_results = run_anomaly_detection(all_data, value_cols)
    t2_elapsed = time.time() - t2

    # ── MODEL 3: Threshold Classification ─────────────────────────────────────
    t3 = time.time()
    threshold_results = run_threshold_analysis(all_data, value_cols)
    t3_elapsed = time.time() - t3

    # ── MODEL 4: Correlation & Feature Importance ─────────────────────────────
    t4 = time.time()
    correlation_results = run_correlation_analysis(merged_df, sensor_ids)
    t4_elapsed = time.time() - t4

    # ── MODEL 5: Behavior Pattern Clustering ──────────────────────────────────
    t5 = time.time()
    clustering_results = run_clustering_analysis(
        merged_df, sensor_ids, all_data, value_cols
    )
    t5_elapsed = time.time() - t5

    # ══════════════════════════════════════════════════════════════════════════
    # PHASE 3: TRAINING SUMMARY REPORT
    # ══════════════════════════════════════════════════════════════════════════
    total_elapsed = time.time() - overall_start

    print("\n" + "╔" + "═" * 68 + "╗")
    print("║   TRAINING COMPLETE — SUMMARY REPORT" + " " * 30 + "║")
    print("╚" + "═" * 68 + "╝")

    print(f"""
  ┌──────────────────────────────────────────────────────────────────┐
  │  Model                              │  Time    │  Status        │
  ├──────────────────────────────────────┼──────────┼────────────────┤
  │  1. Temporal Trend Analysis          │  {t1_elapsed:>5.1f}s   │  {'✓ Complete' if temporal_results else '✗ Failed'}  │
  │     (LR, Poly, RF, GB, Holt-Winters)│          │                │
  ├──────────────────────────────────────┼──────────┼────────────────┤
  │  2. Anomaly Detection                │  {t2_elapsed:>5.1f}s   │  {'✓ Complete' if anomaly_results else '✗ Failed'}  │
  │     (Isolation Forest, LOF, SVM,     │          │                │
  │      DBSCAN)                         │          │                │
  ├──────────────────────────────────────┼──────────┼────────────────┤
  │  3. Threshold Classification         │  {t3_elapsed:>5.1f}s   │  {'✓ Complete' if threshold_results else '✗ Failed'}  │
  │     (GMM + Decision Tree + RF)       │          │                │
  ├──────────────────────────────────────┼──────────┼────────────────┤
  │  4. Correlation & Feature Importance │  {t4_elapsed:>5.1f}s   │  {'✓ Complete' if correlation_results else '✗ Failed'}  │
  │     (RF/GB Importance, MI, PCA)      │          │                │
  ├──────────────────────────────────────┼──────────┼────────────────┤
  │  5. Behavior Pattern Clustering      │  {t5_elapsed:>5.1f}s   │  {'✓ Complete' if clustering_results else '✗ Failed'}  │
  │     (K-Means, GMM, Hierarchical)     │          │                │
  └──────────────────────────────────────┴──────────┴────────────────┘

  Total Training Time: {total_elapsed:.1f}s
""")

    # Count saved models
    model_count = 0
    for root, dirs, files in os.walk(model_dir):
        model_count += sum(1 for f in files if f.endswith(".joblib"))

    print(f"  Trained Models Saved: {model_count} .joblib files")
    print(f"  Model Directory: {model_dir}")

    # List all saved files
    print(f"\n  Saved Files:")
    for root, dirs, files in os.walk(model_dir):
        level = root.replace(model_dir, "").count(os.sep)
        indent = "    " + "  " * level
        folder_name = os.path.basename(root)
        if level > 0:
            print(f"{indent}📁 {folder_name}/")
        for f in sorted(files):
            size_kb = os.path.getsize(os.path.join(root, f)) / 1024
            icon = "🤖" if f.endswith(".joblib") else "📄"
            print(f"{indent}  {icon} {f} ({size_kb:.1f} KB)")

    # Save overall summary
    overall_summary = {
        "training_timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total_training_time_seconds": round(total_elapsed, 1),
        "sensors": list(value_cols.keys()),
        "value_columns": value_cols,
        "models_trained": model_count,
        "analysis_types": {
            "temporal_trend": bool(temporal_results),
            "anomaly_detection": bool(anomaly_results),
            "threshold_classification": bool(threshold_results),
            "correlation_analysis": bool(correlation_results),
            "behavior_clustering": bool(clustering_results),
        },
        "phase_times": {
            "temporal": round(t1_elapsed, 1),
            "anomaly": round(t2_elapsed, 1),
            "threshold": round(t3_elapsed, 1),
            "correlation": round(t4_elapsed, 1),
            "clustering": round(t5_elapsed, 1),
        },
    }

    summary_path = os.path.join(model_dir, "training_summary.json")
    with open(summary_path, "w") as f:
        json.dump(overall_summary, f, indent=2)
    print(f"\n  Overall summary → {summary_path}")

    # ══════════════════════════════════════════════════════════════════════════
    # PHASE 4: COPY RESULTS TO DASHBOARD
    # ══════════════════════════════════════════════════════════════════════════
    project_root = os.path.dirname(os.path.dirname(__file__))
    dashboard_ml_dir = os.path.join(project_root, "dashboard", "public", "ml_results")
    os.makedirs(dashboard_ml_dir, exist_ok=True)

    copy_map = {
        os.path.join(model_dir, "temporal", "temporal_summary.json"): "temporal.json",
        os.path.join(model_dir, "anomaly", "anomaly_summary.json"): "anomaly.json",
        os.path.join(model_dir, "threshold", "threshold_summary.json"): "threshold.json",
        os.path.join(model_dir, "correlation", "correlation_summary.json"): "correlation.json",
        os.path.join(model_dir, "clustering", "clustering_summary.json"): "clustering.json",
        summary_path: "training_summary.json",
    }

    print("\n  Copying ML results to dashboard/public/ml_results/...")
    for src, dest_name in copy_map.items():
        dest = os.path.join(dashboard_ml_dir, dest_name)
        if os.path.exists(src):
            shutil.copy2(src, dest)
            print(f"    ✓  {dest_name}")
        else:
            print(f"    ✗  {dest_name} (source not found: {src})")

    print(f"\n  Dashboard ML results updated: {dashboard_ml_dir}")

    print("\n  Done! All ML models trained and saved successfully.")
    print("  These models can be loaded with joblib.load() for inference.\n")


if __name__ == "__main__":
    main()
