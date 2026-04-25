# AquaWatch — IoT Water Quality Monitoring System

A complete end-to-end IoT system for real-time water quality monitoring using a sensor buoy, Firebase Realtime Database, a Python ML pipeline, and a live React dashboard.

**Live Dashboard:** https://iot-buoy.web.app

---

## System Overview

```
IoT Buoy (Sensors)
      │  WiFi / MQTT
      ▼
Firebase Realtime Database (asia-southeast1)
      │  REST / SDK
      ├──► Python ML Pipeline  (ml_models/)
      │         └── Trained Models (.joblib)
      │         └── JSON Results  (dashboard/public/ml_results/)
      │
      └──► React Dashboard    (dashboard/)
                └── Live at https://iot-buoy.web.app
```

---

## Sensors

| Sensor | Firebase Path | Unit |
|---|---|---|
| Turbidity | `test-data/Turbidity` | NTU |
| pH | `test-data/pH` | pH |
| Temperature | `test-data/Temperature` | °F → converted to °C |
| TDS | `test-data/TDS` | ppm |
| Light | `test-data/Light` | lux |
| Motion (Axis) | `test-data/Axis` | X/Y/Z → magnitude |

---

## Machine Learning Pipeline

All models are trained on the full Firebase dataset using **scikit-learn** and **statsmodels**. Training fetches live data, trains 5 analysis types, and auto-copies JSON results to the dashboard.

### ML Model 1 — Temporal Trend Analysis (`model_temporal.py`)

Forecasts future sensor readings using time-series machine learning.

| Technique | Purpose |
|---|---|
| Linear Regression | Baseline trend estimation |
| Polynomial Regression (deg 2) | Non-linear trend capture |
| Random Forest Regressor | Non-parametric forecasting |
| Gradient Boosting Regressor | Ensemble forecasting |
| Holt-Winters Exponential Smoothing | Seasonal decomposition + forecasting |

- **Evaluation**: TimeSeriesSplit cross-validation (5 folds), MAE / RMSE / R²
- **Features**: lag 1–10, rolling mean/std (5, 10), EMA-5, hour, day-of-week, time index
- **Best model** selected per sensor by lowest MAE

### ML Model 2 — Anomaly Detection (`model_anomaly.py`)

Detects unusual sensor readings automatically — no manual threshold needed.

| Technique | Purpose |
|---|---|
| Isolation Forest | Tree-based unsupervised anomaly detection |
| Local Outlier Factor (LOF) | Density-based outlier detection |
| One-Class SVM | Support vector anomaly boundary |
| DBSCAN | Density clustering — noise points = anomalies |
| Z-Score Baseline | Statistical comparison to show ML improvement |

- **Features**: raw value, rate of change (diff_1, diff_2), rolling mean deviation, rolling std, local z-score

### ML Model 3 — Threshold-Based Alert Classification (`model_threshold.py`)

Instead of hard-coded alert limits, learns safe/warning/danger ranges from data.

| Technique | Purpose |
|---|---|
| Gaussian Mixture Model (GMM) | Learns distribution-based boundaries |
| K-Means | Boundary learning from clusters |
| Decision Tree Classifier | Interpretable threshold rules |
| Random Forest Classifier | Ensemble alert classification |

### ML Model 4 — Correlation Analysis (`model_correlation.py`)

Reveals which sensors influence each other using tree-based and statistical methods.

| Technique | Purpose |
|---|---|
| Random Forest Regressor | Feature importance per sensor target |
| Gradient Boosting Regressor | Feature importance comparison |
| Mutual Information Regression | Non-linear dependency measurement |
| Pearson & Spearman Correlation | Linear and rank-order correlation matrix |
| PCA (Principal Component Analysis) | Dimensionality reduction to find latent sensor relationships |

### ML Model 5 — Behavior Pattern Clustering (`model_clustering.py`)

Discovers recurring environmental states of the water body (e.g., "calm morning", "turbid afternoon").

| Technique | Purpose |
|---|---|
| K-Means Clustering | Partition-based clustering |
| Gaussian Mixture Model Clustering | Probabilistic soft clustering |
| Agglomerative Hierarchical Clustering | Tree-based merging |
| Silhouette Analysis | Optimal cluster count selection |
| Multi-sensor clustering | System-wide behavior patterns across ALL sensors |

---

## Project Structure

```
IOT_PROJECT/
├── dashboard/                    # React + Vite frontend
│   ├── src/
│   │   ├── App.jsx               # Main app — all page views
│   │   ├── firebase.js           # Firebase SDK config & exports
│   │   ├── components/           # Reusable UI components
│   │   │   ├── SensorCard.jsx    # Live sensor value + sparkline
│   │   │   ├── TrendChart.jsx    # Multi-sensor area chart
│   │   │   ├── ForecastChart.jsx # ML forecast visualization
│   │   │   ├── AnomalyChart.jsx  # Anomaly overlay chart
│   │   │   ├── ClusterChart.jsx  # Cluster pattern chart
│   │   │   ├── CorrelationChart.jsx  # Heatmap + scatter
│   │   │   ├── AlertSidebar.jsx  # Real-time alert feed
│   │   │   └── DataMonitoring.jsx    # Raw data table
│   │   ├── hooks/
│   │   │   └── useFirebaseData.js    # Real-time Firebase data hook
│   │   ├── utils/
│   │   │   ├── analysis.js       # Alert + threshold logic
│   │   │   ├── mlResults.js      # ML JSON loader (cached fetch)
│   │   │   └── formatters.js     # Value formatters
│   │   └── config/
│   │       └── sensors.js        # Sensor metadata (labels, units, ranges)
│   └── public/
│       └── ml_results/           # Pre-trained ML result JSONs (read by dashboard)
│           ├── temporal.json
│           ├── anomaly.json
│           ├── threshold.json
│           ├── correlation.json
│           ├── clustering.json
│           └── training_summary.json
│
├── ml_models/                    # Python ML training pipeline
│   ├── fetch_data.py             # Firebase data fetcher (all sensors)
│   ├── model_temporal.py         # Model 1: Temporal trend analysis
│   ├── model_anomaly.py          # Model 2: Anomaly detection
│   ├── model_threshold.py        # Model 3: Threshold classification
│   ├── model_correlation.py      # Model 4: Correlation analysis
│   ├── model_clustering.py       # Model 5: Behavior clustering
│   ├── train_models.py           # Full training pipeline orchestrator
│   ├── requirements.txt          # Python dependencies
│   └── trained_models/           # Saved .joblib model files + JSON summaries
│
└── firebase.json                 # Firebase hosting config
```

---

## Data Flow

1. **Sensor buoy** reads Turbidity, pH, Temperature, TDS, Light, and Axis sensors
2. **Buoy firmware** pushes each reading to Firebase Realtime Database as a JSON record with `Timestamp`
3. **Dashboard** connects via Firebase SDK:
   - On load: fetches last 100 readings per sensor (`get()` + `limitToLast`)
   - Live: subscribes with `onChildAdded` to receive each new reading in real time
   - Debounces state updates (500ms) to prevent excessive re-renders
4. **ML pipeline** (run offline to retrain):
   - `fetch_data.py` downloads all records from Firebase
   - Each model script trains on the full dataset
   - Results saved as `.joblib` (models) + `.json` (summaries)
   - `train_models.py` auto-copies JSON results to `dashboard/public/ml_results/`
5. **Dashboard reads** pre-computed ML results from `/ml_results/*.json` at startup

---

## Real-Time Architecture

```
Firebase RTDB
     │
     │  get(limitToLast(100))  ← initial load (one-time)
     │  onChildAdded           ← live updates (one event per new record)
     ▼
useFirebaseData.js hook
     │  liveBufferRef (in-memory, no re-render)
     │  scheduleFlush() — debounced 500ms
     ▼
setSensorData → React state update → UI render
```

This pattern avoids the performance issue of re-downloading all records on every update.

---

## How to Run

### Dashboard (Development)

```bash
cd dashboard
npm install
npm run dev
```

### Dashboard (Deploy to Firebase Hosting)

```bash
cd dashboard
npm run build
cd ..
firebase deploy
```

### ML Model Training

```bash
cd ml_models
pip install -r requirements.txt
python train_models.py
```

This will:
1. Fetch all sensor data from Firebase
2. Train all 5 ML analysis types (68+ models)
3. Save `.joblib` model files to `trained_models/`
4. Auto-copy JSON result summaries to `dashboard/public/ml_results/`

---

## Dashboard Pages

| Page | Description |
|---|---|
| Dashboard | Live sensor cards + real-time trend chart + alert sidebar |
| Forecasting | ML-based forecast for each sensor (Holt-Winters best model) |
| Anomalies | Anomaly overlay chart — ML-detected vs statistical baseline |
| Clusters | Behavior pattern clusters across all sensors |
| Correlation | Heatmap of sensor relationships + scatter analysis |
| Alerts | All active and historical alerts from ML threshold models |
| Monitoring | Raw data table with search and export |
| Settings | Firebase config and display preferences |

---

## Software Engineering Design Decisions

- **Modular components**: Each chart and UI panel is a separate React component with `memo()` for performance
- **Single data hook**: All Firebase data management centralized in `useFirebaseData.js` — no component fetches data directly
- **Cached ML loader**: `mlResults.js` caches JSON fetches to avoid repeated network requests
- **Sensor config**: `config/sensors.js` is the single source of truth for sensor metadata (labels, units, safe ranges, colors)
- **Performance**: Animations disabled on all charts; data downsampled for rendering; debounced state updates
- **Error handling**: Firebase connection errors, missing ML results, and empty data states are all handled gracefully

---

## Firebase Configuration

- **Project**: `iot-buoy`
- **Region**: `asia-southeast1`
- **Database URL**: `https://iot-buoy-default-rtdb.asia-southeast1.firebasedatabase.app`
- **Hosting**: `https://iot-buoy.web.app`
