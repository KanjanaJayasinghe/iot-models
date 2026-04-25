"""
fetch_data.py — Firebase RTDB Data Fetcher for IoT Buoy Sensors
================================================================
Fetches sensor data from Firebase Realtime Database and returns
structured pandas DataFrames for ML model training.

Sensors: Turbidity (NTU), pH, Temperature (°C), TDS (ppm), Light (lux), Axis (Motion)
Database: https://iot-buoy-default-rtdb.asia-southeast1.firebasedatabase.app
"""

import json
import math
import urllib.request
import pandas as pd
import numpy as np
from datetime import datetime

# ─── Firebase Configuration ───────────────────────────────────────────────────
FIREBASE_URL = "https://iot-buoy-default-rtdb.asia-southeast1.firebasedatabase.app"

SENSOR_CONFIG = {
    "turbidity": {"path": "test-data/Turbidity", "unit": "NTU"},
    "ph":          {"path": "test-data/pH",        "unit": "pH"},
    "temperature": {"path": "test-data/Temperature","unit": "°C"},
    "tds":         {"path": "test-data/TDS",        "unit": "ppm"},
    "light":       {"path": "test-data/Light",      "unit": "lux"},
    "axis":        {"path": "test-data/Axis",       "unit": ""},
}

META_KEYS = {"Timestamp", "SensorID", "sensorId", "sensor_id"}


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

    # Detect numeric value columns (excluding metadata)
    value_cols = [
        c for c in df.columns
        if c not in META_KEYS and c != "_key"
        and pd.to_numeric(df[c], errors="coerce").notna().any()
    ]

    for col in value_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Temperature sensor stores Fahrenheit — convert to Celsius
    if sensor_id == "temperature":
        for col in value_cols:
            df[col] = (df[col] - 32) * 5 / 9

    # For multi-axis sensors ONLY (Axis: X, Y, Z), compute magnitude
    # Temperature, TDS etc. may have extra columns but should NOT use magnitude
    numeric_cols = [c for c in value_cols if c not in META_KEYS and c != "_key"]
    if len(numeric_cols) > 1 and sensor_id == "axis":
        df["_magnitude"] = np.sqrt(sum(df[c].fillna(0) ** 2 for c in numeric_cols))
        df["_magnitude"] = df["_magnitude"].round(3)

    return df


def fetch_all_sensors() -> dict:
    """Fetch data for all sensors. Returns dict of {sensor_id: DataFrame}."""
    all_data = {}
    for sensor_id in SENSOR_CONFIG:
        print(f"  Fetching {sensor_id}...", end=" ")
        df = fetch_sensor_data(sensor_id)
        all_data[sensor_id] = df
        print(f"{len(df)} records")
    return all_data


def get_primary_value_column(df: pd.DataFrame, sensor_id: str) -> str:
    """Get the primary numeric value column for a sensor DataFrame."""
    exclude = META_KEYS | {"_key", "Timestamp"}

    # Only prefer _magnitude for axis (motion) sensor with X/Y/Z components
    if "_magnitude" in df.columns and sensor_id == "axis":
        return "_magnitude"

    numeric_cols = [
        c for c in df.select_dtypes(include=[np.number]).columns
        if c not in exclude and c != "_magnitude"
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
