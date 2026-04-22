"""
=============================================================================
MODEL 4: Correlation Analysis — Feature Importance & Learned Relationships
=============================================================================
Techniques Used:
  1. Random Forest Regressor — feature importance for each target sensor
  2. Gradient Boosting Regressor — feature importance comparison
  3. Mutual Information Regression — non-linear dependency measurement
  4. Pearson & Spearman Correlation Matrix — linear & rank-order analysis
  5. Principal Component Analysis (PCA) — dimensionality reduction to find
     latent relationships between sensors

Instead of simple pairwise correlation, we use tree-based models to learn
which sensors are most important for predicting each other, revealing
complex multi-variate relationships.

Links to IoT Buoy Use Case:
  - Understanding which water quality parameters influence each other
  - Identifying redundant sensors (cost optimization)
  - Detecting causal relationships (e.g., temperature → turbidity)
  - Building predictive models using correlated sensor inputs
=============================================================================
"""

import os
import json
import warnings
import numpy as np
import pandas as pd
import joblib

from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.feature_selection import mutual_info_regression
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import cross_val_score
from scipy.stats import spearmanr

warnings.filterwarnings("ignore")

# ─── Output Directory ─────────────────────────────────────────────────────────
MODEL_DIR = os.path.join(os.path.dirname(__file__), "trained_models", "correlation")
os.makedirs(MODEL_DIR, exist_ok=True)


# ══════════════════════════════════════════════════════════════════════════════
# STEP 1: BUILD MULTI-SENSOR FEATURE MATRIX
# ══════════════════════════════════════════════════════════════════════════════
def prepare_correlation_data(merged_df: pd.DataFrame, sensor_ids: list) -> pd.DataFrame:
    """
    Prepare clean merged DataFrame for correlation analysis.
    Drops rows with any NaN in sensor columns.
    """
    available = [s for s in sensor_ids if s in merged_df.columns]
    df = merged_df[available].dropna()
    return df


# ══════════════════════════════════════════════════════════════════════════════
# STEP 2: TREE-BASED FEATURE IMPORTANCE
# ══════════════════════════════════════════════════════════════════════════════
def train_feature_importance_models(df: pd.DataFrame, sensor_ids: list) -> dict:
    """
    For each sensor as TARGET, train a Random Forest and Gradient Boosting model
    using all OTHER sensors as features. Extract feature importances.

    This reveals which sensors are most predictive of each target sensor.
    """
    print(f"\n{'─' * 60}")
    print(f"  TREE-BASED FEATURE IMPORTANCE")
    print(f"{'─' * 60}")

    available = [s for s in sensor_ids if s in df.columns]
    if len(available) < 2:
        print("  [SKIP] Need at least 2 sensors for correlation")
        return {}

    results = {}

    for target_sensor in available:
        feature_sensors = [s for s in available if s != target_sensor]
        X = df[feature_sensors].values
        y = df[target_sensor].values

        if len(X) < 20:
            continue

        print(f"\n  Target: {target_sensor.upper()} | Features: {', '.join(feature_sensors)}")

        # ── Random Forest Feature Importance ──
        rf = RandomForestRegressor(
            n_estimators=100,
            max_depth=8,
            random_state=42,
            n_jobs=-1,
        )
        rf.fit(X, y)                                              # <── TRAINING STEP

        rf_importances = dict(zip(feature_sensors, rf.feature_importances_.tolist()))

        # Cross-validation R² score
        rf_cv_scores = cross_val_score(rf, X, y, cv=5,
                                       scoring="r2")              # <── CV EVALUATION
        print(f"    Random Forest R²: {rf_cv_scores.mean():.3f} ± {rf_cv_scores.std():.3f}")

        # ── Gradient Boosting Feature Importance ──
        gb = GradientBoostingRegressor(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.1,
            random_state=42,
        )
        gb.fit(X, y)                                              # <── TRAINING STEP

        gb_importances = dict(zip(feature_sensors, gb.feature_importances_.tolist()))

        gb_cv_scores = cross_val_score(gb, X, y, cv=5,
                                       scoring="r2")              # <── CV EVALUATION
        print(f"    Gradient Boosting R²: {gb_cv_scores.mean():.3f} ± {gb_cv_scores.std():.3f}")

        # ── Mutual Information ──
        mi_scores = mutual_info_regression(X, y, random_state=42)
        mi_importances = dict(zip(feature_sensors, mi_scores.tolist()))

        # Print importance ranking
        print(f"\n    Feature Importance Ranking for → {target_sensor}:")
        all_imp = sorted(rf_importances.items(), key=lambda x: -x[1])
        for fname, imp in all_imp:
            bar = "█" * int(imp * 50)
            print(f"      {fname:>15s}: RF={imp:.3f}  GB={gb_importances[fname]:.3f}  "
                  f"MI={mi_importances[fname]:.3f}  {bar}")

        # Save best model for this target
        best_model = rf if rf_cv_scores.mean() >= gb_cv_scores.mean() else gb
        best_name = "Random_Forest" if best_model is rf else "Gradient_Boosting"
        model_path = os.path.join(MODEL_DIR, f"{target_sensor}_predictor.joblib")
        joblib.dump({
            "model": best_model,
            "feature_sensors": feature_sensors,
            "target_sensor": target_sensor,
        }, model_path)
        print(f"    Saved → {model_path}")

        results[target_sensor] = {
            "feature_sensors": feature_sensors,
            "rf_importances": rf_importances,
            "gb_importances": gb_importances,
            "mutual_information": mi_importances,
            "rf_cv_r2": float(rf_cv_scores.mean()),
            "gb_cv_r2": float(gb_cv_scores.mean()),
            "best_model": best_name,
            "model_path": model_path,
        }

    return results


# ══════════════════════════════════════════════════════════════════════════════
# STEP 3: CORRELATION MATRICES (PEARSON + SPEARMAN)
# ══════════════════════════════════════════════════════════════════════════════
def compute_correlation_matrices(df: pd.DataFrame, sensor_ids: list) -> dict:
    """
    Compute both Pearson (linear) and Spearman (rank) correlation matrices.
    """
    print(f"\n{'─' * 60}")
    print(f"  CORRELATION MATRICES (PEARSON & SPEARMAN)")
    print(f"{'─' * 60}")

    available = [s for s in sensor_ids if s in df.columns]

    # Pearson correlation
    pearson_matrix = df[available].corr(method="pearson")
    print(f"\n  Pearson Correlation Matrix:")
    print(pearson_matrix.round(3).to_string())

    # Spearman correlation
    spearman_matrix = df[available].corr(method="spearman")
    print(f"\n  Spearman Correlation Matrix:")
    print(spearman_matrix.round(3).to_string())

    # Find strongest correlations
    print(f"\n  Strongest Correlations (|r| > 0.3):")
    for i, s1 in enumerate(available):
        for j, s2 in enumerate(available):
            if i >= j:
                continue
            r = pearson_matrix.loc[s1, s2]
            if abs(r) > 0.3:
                strength = "STRONG" if abs(r) > 0.7 else "MODERATE"
                direction = "positive" if r > 0 else "negative"
                print(f"    {s1} ↔ {s2}: r={r:.3f} ({strength} {direction})")

    return {
        "pearson": pearson_matrix.to_dict(),
        "spearman": spearman_matrix.to_dict(),
    }


# ══════════════════════════════════════════════════════════════════════════════
# STEP 4: PCA — DIMENSIONALITY REDUCTION
# ══════════════════════════════════════════════════════════════════════════════
def train_pca(df: pd.DataFrame, sensor_ids: list) -> dict:
    """
    Train PCA to find latent relationships between sensors.
    Shows how much variance each principal component explains and
    which sensors contribute most to each component.
    """
    print(f"\n{'─' * 60}")
    print(f"  PCA — DIMENSIONALITY REDUCTION")
    print(f"{'─' * 60}")

    available = [s for s in sensor_ids if s in df.columns]
    X = df[available].dropna().values

    if len(X) < 10:
        print("  [SKIP] Not enough data")
        return {}

    # Standardize
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)                             # <── SCALING

    # ── PCA TRAINING ──
    n_components = min(len(available), X_scaled.shape[0])
    pca = PCA(n_components=n_components)
    pca.fit(X_scaled)                                              # <── TRAINING STEP

    # Explained variance
    print(f"\n  Explained Variance Ratio:")
    cumulative = 0
    for i, (var, cum) in enumerate(zip(pca.explained_variance_ratio_,
                                        np.cumsum(pca.explained_variance_ratio_))):
        bar = "█" * int(var * 50)
        print(f"    PC{i + 1}: {var:.3f} (cumulative: {cum:.3f})  {bar}")

    # Component loadings
    print(f"\n  Component Loadings (sensor contributions to each PC):")
    loadings = pd.DataFrame(
        pca.components_.T,
        columns=[f"PC{i + 1}" for i in range(n_components)],
        index=available,
    )
    print(loadings.round(3).to_string())

    # Save PCA model
    pca_path = os.path.join(MODEL_DIR, "pca_model.joblib")
    joblib.dump({"pca": pca, "scaler": scaler, "sensors": available}, pca_path)
    print(f"\n  Saved → {pca_path}")

    return {
        "explained_variance": pca.explained_variance_ratio_.tolist(),
        "cumulative_variance": np.cumsum(pca.explained_variance_ratio_).tolist(),
        "loadings": loadings.to_dict(),
        "n_components_90pct": int(np.argmax(np.cumsum(pca.explained_variance_ratio_) >= 0.9) + 1),
        "model_path": pca_path,
    }


# ══════════════════════════════════════════════════════════════════════════════
# RUN ALL CORRELATION ANALYSIS
# ══════════════════════════════════════════════════════════════════════════════
def run_correlation_analysis(merged_df: pd.DataFrame, sensor_ids: list) -> dict:
    """Run all correlation/feature importance analysis."""
    print("\n" + "=" * 60)
    print("  MODEL 4: CORRELATION & FEATURE IMPORTANCE")
    print("  Tree-Based Models + Mutual Information + PCA")
    print("=" * 60)

    df = prepare_correlation_data(merged_df, sensor_ids)
    print(f"  Clean data: {len(df)} rows × {len(df.columns)} sensors")

    if len(df) < 10:
        print("  [SKIP] Not enough merged data")
        return {}

    # Tree-based feature importance
    importance_results = train_feature_importance_models(df, sensor_ids)

    # Correlation matrices
    corr_results = compute_correlation_matrices(df, sensor_ids)

    # PCA
    pca_results = train_pca(df, sensor_ids)

    all_results = {
        "feature_importance": importance_results,
        "correlation_matrices": corr_results,
        "pca": pca_results,
        "n_samples": len(df),
    }

    # Save summary
    summary_path = os.path.join(MODEL_DIR, "correlation_summary.json")
    with open(summary_path, "w") as f:
        json.dump(all_results, f, indent=2, default=str)
    print(f"\n  Summary saved → {summary_path}")

    return all_results
