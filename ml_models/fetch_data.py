"""
fetch_data.py — Firebase RTDB Data Fetcher for IoT Buoy Sensors
================================================================
Fetches sensor data from Firebase Realtime Database and returns
structured pandas DataFrames for ML model training.

Sensors: Turbidity (NTU), pH, Temperature (°C), TDS (ppm), Light (lux), Axis (Motion)
Database: https://iot-buoy-default-rtdb.asia-southeast1.firebasedatabase.app
"""

import json
import urllib.request
import pandas as pd
import numpy as np

# ─── Firebase Configuration ───────────────────────────────────────────────────
FIREBASE_URL = "https://iot-buoy-default-rtdb.asia-southeast1.firebasedatabase.app"

SENSOR_CONFIG = {
    "turbidity": {"path": "test-data/Turbidity", "unit": "NTU", "value_column": "NTU"},
    "ph": {"path": "test-data/pH", "unit": "pH", "value_column": "pH"},
    "temperature": {"path": "test-data/Temperature", "unit": "°C", "value_column": "Celsius"},
    "tds": {"path": "test-data/TDS", "unit": "ppm", "value_column": "PPM"},
    "light": {"path": "test-data/Light", "unit": "lux", "value_column": "Lux"},
    "axis": {
        "path": "test-data/Axis",
        "unit": "",
        "value_column": "_magnitude",
        "accel_columns": ["AX", "AY", "AZ"],
        "gravity_columns": ["GX", "GY", "GZ"],
    },
}

META_KEYS = {"Timestamp", "SensorID", "sensorId", "sensor_id"}

TEMPERATURE_INVALID_RAW_VALUES = {-127, -128}
TEMPERATURE_VALID_RANGE_C = (-5.0, 45.0)
LIGHT_INVALID_VALUES = {-2}


def _remove_iqr_outliers(df: pd.DataFrame, value_column: str, multiplier: float = 3.0) -> pd.DataFrame:
    """Drop extreme outliers using a conservative IQR fence."""
    if df.empty or value_column not in df.columns:
        return df

    series = pd.to_numeric(df[value_column], errors="coerce").dropna()
    if len(series) < 24 or series.nunique() < 6:
        return df

    q1 = series.quantile(0.25)
    q3 = series.quantile(0.75)
    iqr = q3 - q1
    if pd.isna(iqr) or iqr <= 0:
        return df

    lower = q1 - multiplier * iqr
    upper = q3 + multiplier * iqr
    mask = pd.to_numeric(df[value_column], errors="coerce").between(lower, upper) | df[value_column].isna()
    return df[mask].reset_index(drop=True)


def _prepare_sensor_measurements(df: pd.DataFrame, sensor_id: str) -> pd.DataFrame:
    """Apply schema-aware preprocessing before ML training."""
    if df.empty:
        return df

    cleaned = df.copy()
    config = SENSOR_CONFIG[sensor_id]
    removed_invalid = 0

    if sensor_id == "axis":
        accel_cols = config["accel_columns"]
        gravity_cols = config["gravity_columns"]

        for col in accel_cols + gravity_cols:
            cleaned[col] = pd.to_numeric(cleaned.get(col), errors="coerce")

        motion_components = [cleaned[a] - cleaned[g] for a, g in zip(accel_cols, gravity_cols)]
        cleaned["_magnitude"] = np.sqrt(sum(component.pow(2) for component in motion_components))
        before = len(cleaned)
        cleaned = cleaned.dropna(subset=["_magnitude"]).reset_index(drop=True)
        removed_invalid += before - len(cleaned)
    else:
        value_column = config["value_column"]
        cleaned[value_column] = pd.to_numeric(cleaned.get(value_column), errors="coerce")

        if sensor_id == "temperature":
            fahrenheit = pd.to_numeric(cleaned.get("Fahrenheit"), errors="coerce")
            cleaned[value_column] = cleaned[value_column].where(cleaned[value_column].notna(), (fahrenheit - 32) * 5 / 9)
            cleaned[value_column] = cleaned[value_column].mask(cleaned[value_column].isin(TEMPERATURE_INVALID_RAW_VALUES))
            cleaned[value_column] = cleaned[value_column].where(
                cleaned[value_column].between(TEMPERATURE_VALID_RANGE_C[0], TEMPERATURE_VALID_RANGE_C[1])
            )
        elif sensor_id == "light":
            cleaned[value_column] = cleaned[value_column].mask(cleaned[value_column].isin(LIGHT_INVALID_VALUES))
            cleaned[value_column] = cleaned[value_column].where(cleaned[value_column] >= 0)
        elif sensor_id == "ph":
            cleaned[value_column] = cleaned[value_column].where(cleaned[value_column].between(0, 14))
        elif sensor_id in {"tds", "turbidity"}:
            cleaned[value_column] = cleaned[value_column].where(cleaned[value_column] >= 0)

        before = len(cleaned)
        cleaned = cleaned.dropna(subset=[value_column]).reset_index(drop=True)
        removed_invalid += before - len(cleaned)

    value_column = config["value_column"]
    before_outliers = len(cleaned)
    cleaned = _remove_iqr_outliers(cleaned, value_column)
    removed_outliers = before_outliers - len(cleaned)

    cleaned.attrs["rows_removed"] = int(removed_invalid + removed_outliers)
    cleaned.attrs["invalid_rows_removed"] = int(removed_invalid)
    cleaned.attrs["outlier_rows_removed"] = int(removed_outliers)
    return cleaned


def fetch_sensor_data(sensor_id: str) -> pd.DataFrame:
    """Fetch raw data for a single sensor from Firebase RTDB."""
    config = SENSOR_CONFIG[sensor_id]
    url = f"{FIREBASE_URL}/{config['path']}.json"

    with urllib.request.urlopen(url) as response:
        raw = json.loads(response.read().decode())

    if not raw:
        return pd.DataFrame()

    records = []
    for key, value in raw.items():
        if isinstance(value, dict):
            value["_key"] = key
            records.append(value)

    df = pd.DataFrame(records)

    # Parse timestamps
    if "Timestamp" in df.columns:
        df["Timestamp"] = pd.to_datetime(df["Timestamp"], errors="coerce")
        df = df.dropna(subset=["Timestamp"])
        df = df.sort_values("Timestamp").reset_index(drop=True)

    return _prepare_sensor_measurements(df, sensor_id)


def fetch_all_sensors() -> dict:
    """Fetch data for all sensors. Returns dict of {sensor_id: DataFrame}."""
    all_data = {}
    for sensor_id in SENSOR_CONFIG:
        print(f"  Fetching {sensor_id}...", end=" ")
        df = fetch_sensor_data(sensor_id)
        all_data[sensor_id] = df
        invalid_removed = df.attrs.get("invalid_rows_removed", 0)
        outlier_removed = df.attrs.get("outlier_rows_removed", 0)
        details = []
        if invalid_removed:
            details.append(f"{invalid_removed} invalid")
        if outlier_removed:
            details.append(f"{outlier_removed} outliers")
        note = f" ({', '.join(details)} removed)" if details else ""
        print(f"{len(df)} records{note}")
    return all_data


def get_primary_value_column(df: pd.DataFrame, sensor_id: str) -> str:
    """Get the primary numeric value column for a sensor DataFrame."""
    exclude = META_KEYS | {"_key", "Timestamp"}

    preferred = SENSOR_CONFIG.get(sensor_id, {}).get("value_column")
    if preferred and preferred in df.columns:
        return preferred

    numeric_cols = [
        c for c in df.select_dtypes(include=[np.number]).columns
        if c not in exclude
    ]

    if numeric_cols:
        return numeric_cols[0]

    return df.columns[0]


def build_merged_dataframe(all_data: dict) -> pd.DataFrame:
    """
    Merge all sensor data into a single DataFrame indexed by Timestamp.
    Each sensor's primary value becomes a column named by sensor_id.
    """
    merged = None

    for sensor_id, df in all_data.items():
        if df.empty or "Timestamp" not in df.columns:
            continue

        val_col = get_primary_value_column(df, sensor_id)
        subset = df[["Timestamp", val_col]].copy()
        subset = subset.rename(columns={val_col: sensor_id})

        if merged is None:
            merged = subset
        else:
            merged = pd.merge(merged, subset, on="Timestamp", how="outer")

    if merged is not None:
        merged = merged.sort_values("Timestamp").reset_index(drop=True)
        # Forward-fill then back-fill small gaps
        for col in SENSOR_CONFIG:
            if col in merged.columns:
                merged[col] = merged[col].interpolate(method="linear", limit=5)

    return merged if merged is not None else pd.DataFrame()


if __name__ == "__main__":
    print("=" * 60)
    print("IoT Buoy — Firebase Data Fetcher")
    print("=" * 60)
    print()

    all_data = fetch_all_sensors()

    print("\n── Per-Sensor Summary ──")
    for sid, df in all_data.items():
        vcol = get_primary_value_column(df, sid)
        if not df.empty and vcol in df.columns:
            print(f"  {sid:>12s}: {len(df):>5d} records | "
                  f"mean={df[vcol].mean():.2f}, std={df[vcol].std():.2f}, "
                  f"range=[{df[vcol].min():.2f}, {df[vcol].max():.2f}]")

    merged = build_merged_dataframe(all_data)
    print(f"\n── Merged DataFrame: {merged.shape[0]} rows x {merged.shape[1]} columns ──")
    print(merged.head(10))
