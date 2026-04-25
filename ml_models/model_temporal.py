"""
=============================================================================
MODEL 1: Temporal Trend Analysis — ML-Based Time-Series Forecasting
=============================================================================
Techniques Used:
  1. Linear Regression (sklearn) — baseline trend estimation
  2. Polynomial Regression (degree 2,3) — non-linear trend capture
  3. Random Forest Regressor — non-parametric time-series modeling
  4. Holt-Winters Exponential Smoothing (statsmodels) — seasonal decomposition
  5. ARIMA / Auto-ARIMA style selection — classical time-series forecasting

Each model is trained per-sensor, evaluated with MAE/RMSE/R², and the best
model is selected and saved for deployment.

Links to IoT Buoy Use Case:
  - Forecasting water quality (turbidity, pH, temperature) helps predict
    environmental hazards before they occur
  - Trend detection enables proactive maintenance of the buoy system
=============================================================================
"""

import os
import json
import warnings
import numpy as np
import pandas as pd
import joblib

from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import PolynomialFeatures
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline

from statsmodels.tsa.holtwinters import ExponentialSmoothing

warnings.filterwarnings("ignore")

# ─── Output Directory ─────────────────────────────────────────────────────────
MODEL_DIR = os.path.join(os.path.dirname(__file__), "trained_models", "temporal")
os.makedirs(MODEL_DIR, exist_ok=True)

FORECAST_HORIZON_HOURS = 48
DEFAULT_INTERVAL_SECONDS = 60
MIN_INTERVAL_SECONDS = 30


# ══════════════════════════════════════════════════════════════════════════════
# FEATURE ENGINEERING FOR TIME-SERIES
# ══════════════════════════════════════════════════════════════════════════════
def estimate_interval_seconds(df: pd.DataFrame) -> int:
    """Estimate the typical sensor sampling interval from recent timestamps."""
    if "Timestamp" not in df.columns or len(df) < 2:
        return DEFAULT_INTERVAL_SECONDS

    timestamps = pd.to_datetime(df["Timestamp"], errors="coerce").dropna()
    if len(timestamps) < 2:
        return DEFAULT_INTERVAL_SECONDS

    deltas = timestamps.diff().dropna().dt.total_seconds()
    deltas = deltas[deltas > 0]
    if deltas.empty:
        return DEFAULT_INTERVAL_SECONDS

    median_seconds = int(round(float(deltas.tail(240).median())))
    return max(MIN_INTERVAL_SECONDS, median_seconds)


def estimate_forecast_steps(interval_seconds: int, forecast_horizon_hours: int = FORECAST_HORIZON_HOURS) -> int:
    """Convert a desired hour-based forecast horizon into model forecast steps."""
    safe_interval = max(MIN_INTERVAL_SECONDS, int(interval_seconds or DEFAULT_INTERVAL_SECONDS))
    return max(20, int(np.ceil((forecast_horizon_hours * 3600) / safe_interval)))


def create_temporal_features(df: pd.DataFrame, value_col: str) -> pd.DataFrame:
    """
    Create time-based features from timestamp and lag features from values.
    Features Generated:
      - hour, day_of_week, day_of_month, month
      - time_index (ordinal position)
      - lag_1, lag_2, lag_3, lag_5, lag_10
      - rolling_mean_5, rolling_std_5
      - rolling_mean_10, rolling_std_10
      - ema_5 (exponential moving average)
    """
    features = pd.DataFrame(index=df.index)

    # Time-based features (if Timestamp exists)
    if "Timestamp" in df.columns:
        ts = pd.to_datetime(df["Timestamp"])
        features["hour"] = ts.dt.hour
        features["day_of_week"] = ts.dt.dayofweek
        features["day_of_month"] = ts.dt.day
        features["month"] = ts.dt.month

    # Ordinal time index
    features["time_index"] = np.arange(len(df))

    # Lag features
    values = df[value_col].values
    for lag in [1, 2, 3, 5, 10]:
        features[f"lag_{lag}"] = pd.Series(values).shift(lag).values

    # Rolling statistics
    s = pd.Series(values)
    features["rolling_mean_5"] = s.rolling(5, min_periods=1).mean().values
    features["rolling_std_5"] = s.rolling(5, min_periods=1).std().fillna(0).values
    features["rolling_mean_10"] = s.rolling(10, min_periods=1).mean().values
    features["rolling_std_10"] = s.rolling(10, min_periods=1).std().fillna(0).values

    # Exponential moving average
    features["ema_5"] = s.ewm(span=5, adjust=False).mean().values

    return features


# ══════════════════════════════════════════════════════════════════════════════
# MODEL TRAINING & EVALUATION
# ══════════════════════════════════════════════════════════════════════════════
def train_temporal_models(df: pd.DataFrame, value_col: str, sensor_id: str) -> dict:
    """
    Train multiple regression models for temporal trend forecasting.

    Models:
      1. Linear Regression
      2. Polynomial Regression (degree=2)
      3. Random Forest Regressor
      4. Gradient Boosting Regressor

    Evaluation: TimeSeriesSplit cross-validation (5 folds)
    """
    print(f"\n{'-' * 60}")
    print(f"  TEMPORAL TREND ANALYSIS - Sensor: {sensor_id.upper()}")
    print(f"{'-' * 60}")

    # ── Feature Engineering ──
    features = create_temporal_features(df, value_col)
    target = df[value_col].values

    # Drop rows with NaN (from lag features)
    valid_mask = features.notna().all(axis=1)
    X = features[valid_mask].values
    y = target[valid_mask]

    if len(X) < 20:
        print(f"  [SKIP] Not enough data for {sensor_id} ({len(X)} samples)")
        return {}

    if len(np.unique(y)) < 3 or float(np.nanstd(y)) < 1e-9:
        print(f"  [SKIP] Not enough variation for {sensor_id}")
        return {}

    print(f"  Data points: {len(X)} | Features: {X.shape[1]}")

    # ── Define Models ──
    models = {
        "Linear_Regression": LinearRegression(),
        "Polynomial_Regression_deg2": Pipeline([
            ("poly", PolynomialFeatures(degree=2, include_bias=False)),
            ("lr", LinearRegression()),
        ]),
        "Random_Forest": RandomForestRegressor(
            n_estimators=100,
            max_depth=10,
            min_samples_split=5,
            random_state=42,
            n_jobs=-1,
        ),
        "Gradient_Boosting": GradientBoostingRegressor(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.1,
            random_state=42,
        ),
    }

    # ── Time-Series Cross-Validation ──
    tscv = TimeSeriesSplit(n_splits=5)
    results = {}

    for model_name, model in models.items():
        fold_metrics = {"mae": [], "rmse": [], "r2": []}

        for _, (train_idx, test_idx) in enumerate(tscv.split(X)):
            X_train, X_test = X[train_idx], X[test_idx]
            y_train, y_test = y[train_idx], y[test_idx]

            # ── MODEL TRAINING ──
            model.fit(X_train, y_train)                            # <── TRAINING STEP

            # ── PREDICTION ──
            y_pred = model.predict(X_test)                         # <── PREDICTION STEP

            # ── EVALUATION METRICS ──
            mae = mean_absolute_error(y_test, y_pred)
            rmse = np.sqrt(mean_squared_error(y_test, y_pred))
            r2 = r2_score(y_test, y_pred)

            fold_metrics["mae"].append(mae)
            fold_metrics["rmse"].append(rmse)
            fold_metrics["r2"].append(r2)

        avg_metrics = {
            metric_name: float(np.mean(metric_values))
            for metric_name, metric_values in fold_metrics.items()
        }
        results[model_name] = avg_metrics

        print(
            f"  {model_name:>30s}  |  MAE={avg_metrics['mae']:.4f}  "
            f"RMSE={avg_metrics['rmse']:.4f}  R2={avg_metrics['r2']:.4f}"
        )

    # ── Select Best Model (lowest MAE) ──
    best_name = min(results, key=lambda k: results[k]["mae"])
    best_model = models[best_name]
    print(f"\n  Best Model: {best_name} (MAE={results[best_name]['mae']:.4f})")

    # ── Retrain Best Model on FULL Dataset ──
    print(f"  Re-training {best_name} on full dataset ({len(X)} samples)...")
    best_model.fit(X, y)                                           # <── FINAL TRAINING

    # ── Save Trained Model ──
    model_path = os.path.join(MODEL_DIR, f"{sensor_id}_temporal_{best_name}.joblib")
    joblib.dump(best_model, model_path)
    print(f"  Saved -> {model_path}")

    return {
        "sensor": sensor_id,
        "best_model": best_name,
        "all_results": results,
        "model_path": model_path,
        "n_samples": len(X),
        "n_features": X.shape[1],
        "feature_names": list(features.columns),
    }


# ══════════════════════════════════════════════════════════════════════════════
# HOLT-WINTERS EXPONENTIAL SMOOTHING (STATSMODELS)
# ══════════════════════════════════════════════════════════════════════════════
def train_holtwinters(df: pd.DataFrame, value_col: str, sensor_id: str,
                      forecast_steps: int = 20, interval_seconds: int = DEFAULT_INTERVAL_SECONDS) -> dict:
    """
    Train Holt-Winters Exponential Smoothing for time-series forecasting.
    Automatically selects additive vs multiplicative trend.
    """
    print(f"\n  Holt-Winters Exponential Smoothing - {sensor_id}")

    values = df[value_col].dropna().values
    if len(values) < 20:
        print(f"  [SKIP] Not enough data ({len(values)} points)")
        return {}

    if len(np.unique(values)) < 3 or float(np.nanstd(values)) < 1e-9:
        print("  [SKIP] Not enough variation for Holt-Winters")
        return {}

    # Train/test split (80/20, preserving time order)
    split_idx = int(len(values) * 0.8)
    train_vals = values[:split_idx]
    test_vals = values[split_idx:]

    best_hw_result = None
    best_mae = float("inf")

    for trend in ["add", "mul"]:
        try:
            # ── MODEL TRAINING (Holt-Winters) ──
            hw_model = ExponentialSmoothing(
                train_vals,
                trend=trend,
                seasonal=None,           # No seasonal component (irregular IoT data)
                initialization_method="estimated",
            ).fit(optimized=True)                                  # <── TRAINING STEP

            # ── PREDICTION ──
            hw_pred = hw_model.forecast(len(test_vals))            # <── FORECAST STEP
            mae = mean_absolute_error(test_vals, hw_pred)

            if mae < best_mae:
                best_mae = mae
                best_hw_result = {
                    "trend": trend,
                    "model": hw_model,
                    "mae": mae,
                    "rmse": float(np.sqrt(mean_squared_error(test_vals, hw_pred))),
                    "params": {
                        "smoothing_level": float(hw_model.params.get("smoothing_level", 0)),
                        "smoothing_trend": float(hw_model.params.get("smoothing_trend", 0)),
                    },
                }
        except Exception:
            continue

    if best_hw_result is None:
        print("  [FAIL] Holt-Winters could not fit")
        return {}

    forecast_horizon_hours = (forecast_steps * max(interval_seconds, MIN_INTERVAL_SECONDS)) / 3600
    print(f"  Trend type: {best_hw_result['trend']} | "
          f"MAE={best_hw_result['mae']:.4f} | RMSE={best_hw_result['rmse']:.4f}")
    print(f"  Forecast horizon: {forecast_horizon_hours:.1f} hours ({forecast_steps} steps @ {interval_seconds}s)")

    # ── Retrain on full data and produce forecast ──
    final_model = ExponentialSmoothing(
        values,
        trend=best_hw_result["trend"],
        seasonal=None,
        initialization_method="estimated",
    ).fit(optimized=True)

    forecast = final_model.forecast(forecast_steps)
    recent_window = values[-min(len(values), 48):]

    # Save
    model_path = os.path.join(MODEL_DIR, f"{sensor_id}_holtwinters.joblib")
    joblib.dump(final_model, model_path)
    print(f"  Saved -> {model_path}")

    return {
        "sensor": sensor_id,
        "forecast_method": "Holt-Winters",
        "trend_type": best_hw_result["trend"],
        "mae": best_hw_result["mae"],
        "rmse": best_hw_result["rmse"],
        "forecast_steps": int(forecast_steps),
        "forecast_interval_seconds": int(interval_seconds),
        "forecast_interval_minutes": float(interval_seconds / 60),
        "forecast_horizon_hours": float(forecast_horizon_hours),
        "train_points": int(len(train_vals)),
        "validation_points": int(len(test_vals)),
        "last_observed_value": float(values[-1]),
        "recent_mean": float(np.mean(recent_window)),
        "recent_min": float(np.min(recent_window)),
        "recent_max": float(np.max(recent_window)),
        "forecast_mean": float(np.mean(forecast)),
        "forecast_min": float(np.min(forecast)),
        "forecast_max": float(np.max(forecast)),
        "params": best_hw_result["params"],
        "forecast": forecast.tolist(),
        "model_path": model_path,
    }


# ══════════════════════════════════════════════════════════════════════════════
# RUN ALL TEMPORAL MODELS FOR ALL SENSORS
# ══════════════════════════════════════════════════════════════════════════════
def run_temporal_analysis(all_data: dict, value_cols: dict) -> dict:
    """
    Run temporal trend analysis for all sensors.
    Returns comprehensive results dictionary.
    """
    print("\n" + "=" * 60)
    print("  MODEL 1: TEMPORAL TREND ANALYSIS")
    print("  ML-Based Regression & Time-Series Forecasting")
    print("=" * 60)

    all_results = {}

    for sensor_id, df in all_data.items():
        if df.empty:
            continue
        val_col = value_cols.get(sensor_id)
        if val_col is None or val_col not in df.columns:
            continue

        interval_seconds = estimate_interval_seconds(df)
        forecast_steps = estimate_forecast_steps(interval_seconds)

        # Regression models
        reg_result = train_temporal_models(df, val_col, sensor_id)

        # Holt-Winters
        hw_result = train_holtwinters(
            df,
            val_col,
            sensor_id,
            forecast_steps=forecast_steps,
            interval_seconds=interval_seconds,
        )

        all_results[sensor_id] = {
            "regression": reg_result,
            "holtwinters": hw_result,
        }

    # Save summary
    summary_path = os.path.join(MODEL_DIR, "temporal_summary.json")
    serializable = {}
    for sid, res in all_results.items():
        serializable[sid] = {
            "regression": {k: v for k, v in res["regression"].items() if k != "model"},
            "holtwinters": {k: v for k, v in res["holtwinters"].items() if k != "model"},
        }
    with open(summary_path, "w") as f:
        json.dump(serializable, f, indent=2, default=str)
    print(f"\n  Summary saved -> {summary_path}")

    return all_results
