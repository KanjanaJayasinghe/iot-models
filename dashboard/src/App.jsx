import { useState, useMemo, useEffect } from 'react';
import { Waves, ShieldAlert, Database, Cpu, Activity, Info } from 'lucide-react';
import { useFirebaseData } from './hooks/useFirebaseData';
import { SENSORS, getValueKey } from './config/sensors';
import Sidebar from './components/Sidebar';
import SensorCard from './components/SensorCard';
import TrendChart from './components/TrendChart';
import AlertSidebar from './components/AlertSidebar';
import CorrelationPanel from './components/CorrelationPanel';
import CorrelationChart from './components/CorrelationChart';
import AnomalyChart from './components/AnomalyChart';
import ClusterChart from './components/ClusterChart';
import ForecastChart from './components/ForecastChart';
import DataMonitoring from './components/DataMonitoring';
import { computeStats } from './utils/analysis';
import { loadThresholdResults, loadTemporalResults } from './utils/mlResults';

export default function App() {
  const { sensorData, valueKeys, mergedData, loading, error, lastUpdated } = useFirebaseData();
  const [page, setPage] = useState('dashboard');

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', backgroundImage: 'radial-gradient(ellipse 80% 60% at 20% -10%, rgba(37,99,235,0.07) 0%, transparent 60%)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 22, background: 'linear-gradient(135deg,#2563eb,#0891b2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 16px 40px rgba(37,99,235,0.35)' }}>
            <Waves style={{ width: 34, height: 34, color: 'white' }} />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '-0.5px' }}>AquaWatch</h2>
          <p style={{ fontSize: 14, color: 'var(--text-faint)', fontWeight: 500 }}>Connecting to live sensors...</p>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 24 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563eb', opacity: 0.3, animation: 'pulse-dot 1.2s ease-in-out infinite', animationDelay: `${i*0.2}s` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
        <div className="card" style={{ padding: 48, maxWidth: 420, textAlign: 'center', borderRadius: 24 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: '#fff1f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <ShieldAlert style={{ width: 32, height: 32, color: '#ef4444' }} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', marginBottom: 10, letterSpacing: '-0.4px' }}>Connection Error</h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 }}>{error}</p>
          <button onClick={() => window.location.reload()} style={{ padding: '12px 32px', borderRadius: 12, background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: 'white', fontWeight: 700, border: 'none', cursor: 'pointer', fontSize: 14, boxShadow: '0 6px 20px rgba(37,99,235,0.32)', transition: 'transform 0.2s' }}>Retry Connection</button>
        </div>
      </div>
    );
  }

  const now = lastUpdated || new Date();

  return (
    <div className={`app-layout ${page !== 'dashboard' ? 'no-aside' : ''}`}>
      <Sidebar active={page} onNavigate={setPage} />

      <div className="top-header">
        <div className="header-title-section">
          <h1>Smart Water Monitoring</h1>
          <p>Real-time sensor data &amp; ML analysis dashboard</p>
        </div>
        <div className="header-right">
          <div className="online-badge">
            <span className="online-dot" />
            Live
          </div>
          <div className="header-time-block">
            <span className="date-label">{now.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
            <span className="time-value">{now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div className="header-avatar">A</div>
        </div>
      </div>

      <main style={{ padding: '18px 20px', overflow: 'auto', minHeight: 0 }}>
        {page === 'dashboard' && (
          <DashboardView sensorData={sensorData} valueKeys={valueKeys} mergedData={mergedData} />
        )}
        {page === 'forecasting' && (
          <ForecastingView sensorData={sensorData} valueKeys={valueKeys} />
        )}
        {page === 'anomalies' && (
          <AnomaliesView sensorData={sensorData} valueKeys={valueKeys} />
        )}
        {page === 'clusters' && (
          <ClustersView sensorData={sensorData} valueKeys={valueKeys} />
        )}
        {page === 'correlation' && (
          <CorrelationView sensorData={sensorData} valueKeys={valueKeys} mergedData={mergedData} />
        )}
        {page === 'alerts' && (
          <AlertsView sensorData={sensorData} valueKeys={valueKeys} />
        )}
        {page === 'monitoring' && (
          <DataMonitoring sensorData={sensorData} valueKeys={valueKeys} />
        )}
        {page === 'settings' && <SettingsView />}
      </main>

      {page === 'dashboard' && (
        <aside style={{ padding: '18px 14px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)' }}>
          <AlertSidebar sensorData={sensorData} valueKeys={valueKeys} />
          <CorrelationPanel sensorData={sensorData} valueKeys={valueKeys} mergedData={mergedData} />
        </aside>
      )}
    </div>
  );
}

/* ── Dashboard Page ── */
function DashboardView({ sensorData, valueKeys, mergedData }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {SENSORS.map(sensor => {
          const data = sensorData[sensor.id] || [];
          const vKey = getValueKey(sensor.id, valueKeys);
          const latest = data.length > 0 ? (Number(data[data.length - 1]?.[vKey]) || 0) : 0;
          return (
            <SensorCard
              key={sensor.id}
              title={sensor.label}
              value={latest}
              unit={sensor.unit}
              data={data}
              dataKey={vKey}
              variant={sensor.variant}
              color={sensor.color}
              colorLight={sensor.colorLight}
            />
          );
        })}
      </div>

      {/* Trend Analysis Chart */}
      <TrendChart sensorData={sensorData} valueKeys={valueKeys} mergedData={mergedData} />
    </div>
  );
}

/* ── Shared Sensor Filter ── */
function SensorFilter({ sensorData, selected, onSelect }) {
  const available = SENSORS.filter(s => sensorData[s.id]?.length > 0);
  return (
    <div className="sensor-filter-wrap">
      <span className="filter-label">Sensor</span>
      <button
        onClick={() => onSelect(null)}
        className="filter-pill"
        style={{
          borderColor: !selected ? '#2563eb' : 'rgba(148,163,184,0.38)',
          background: !selected ? '#2563eb' : 'transparent',
          color: !selected ? 'white' : 'var(--text-muted)',
          boxShadow: !selected ? '0 4px 14px rgba(37,99,235,0.28)' : 'none',
        }}
      >All</button>
      {available.map(s => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className="filter-pill"
          style={{
            borderColor: selected === s.id ? s.color : 'rgba(148,163,184,0.38)',
            background: selected === s.id ? s.color : 'transparent',
            color: selected === s.id ? 'white' : 'var(--text-muted)',
            boxShadow: selected === s.id ? `0 4px 14px ${s.color}44` : 'none',
          }}
        >{s.label}</button>
      ))}
    </div>
  );
}

function useActiveSensors(sensorData, selectedSensor) {
  const available = SENSORS.filter(s => sensorData[s.id]?.length > 0);
  return selectedSensor ? available.filter(s => s.id === selectedSensor) : available;
}

/* ── Page Header ── */
function PageHeader({ title, subtitle }) {
  return (
    <div className="page-header">
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}

/* ══════════════════════════════
   PAGE 1 — Forecasting
   ══════════════════════════════ */
function ForecastingView({ sensorData, valueKeys }) {
  const [sel, setSel] = useState(null);
  const active = useActiveSensors(sensorData, sel);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Time-Series Forecasting"
        subtitle="ML models: Linear Regression, Polynomial, Random Forest, Gradient Boosting + Holt-Winters (scikit-learn trained)"
      />
      <SensorFilter sensorData={sensorData} selected={sel} onSelect={setSel} />

      {/* Forecast Charts — full width, one per row for readability */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {active.map(s => {
          const vKey = getValueKey(s.id, valueKeys);
          return (
            <ForecastChart
              key={s.id}
              data={sensorData[s.id]}
              dataKey={vKey}
              title={`${s.label} Forecast`}
              color={s.color}
              unit={` ${s.unit}`}
              sensorId={s.id}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════
   PAGE 2 — Anomaly Detection
   ══════════════════════════════ */
function AnomaliesView({ sensorData, valueKeys }) {
  const [sel, setSel] = useState(null);
  const active = useActiveSensors(sensorData, sel);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Anomaly & Outlier Detection"
        subtitle="ML models: Isolation Forest, Local Outlier Factor, One-Class SVM, DBSCAN (scikit-learn trained)"
      />
      <SensorFilter sensorData={sensorData} selected={sel} onSelect={setSel} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {active.map(s => {
          const vKey = getValueKey(s.id, valueKeys);
          return (
            <AnomalyChart
              key={s.id}
              data={sensorData[s.id]}
              dataKey={vKey}
              title={`${s.label} Anomaly Detection`}
              color={s.color}
              sensorId={s.id}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════
   PAGE 3 — Behavior Clusters
   ══════════════════════════════ */
function ClustersView({ sensorData, valueKeys }) {
  const [sel, setSel] = useState(null);
  const active = useActiveSensors(sensorData, sel);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Behavior Pattern Clusters"
        subtitle="ML models: K-Means with optimal k (silhouette analysis), GMM, Hierarchical Clustering (scikit-learn trained)"
      />
      <SensorFilter sensorData={sensorData} selected={sel} onSelect={setSel} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {active.map(s => {
          const vKey = getValueKey(s.id, valueKeys);
          return (
            <ClusterChart
              key={s.id}
              data={sensorData[s.id]}
              dataKey={vKey}
              title={`${s.label} Behavior Clusters`}
              sensorId={s.id}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════
   PAGE 4 — Correlation Analysis
   ══════════════════════════════ */
function CorrelationView({ sensorData, valueKeys, mergedData }) {
  const available = SENSORS.filter(s => sensorData[s.id]?.length > 0);

  // Compute quick stats for all sensors for the overview cards
  const sensorStats = useMemo(() => {
    return available.map(s => {
      const vKey = getValueKey(s.id, valueKeys);
      const stats = computeStats(sensorData[s.id], vKey);
      return { ...s, stats, count: sensorData[s.id].length };
    });
  }, [sensorData, valueKeys, available]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Sensor Correlation Analysis"
        subtitle="ML models: Random Forest / Gradient Boosting feature importance, Mutual Information, PCA (scikit-learn trained)"
      />

      {/* Compact sensor overview */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(sensorStats.length, 6)}, 1fr)`, gap: 14 }}>
        {sensorStats.map(s => (
          <div key={s.id} className="card" style={{ padding: '16px 18px', borderTop: `3px solid ${s.color}`, borderRadius: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, boxShadow: `0 0 6px ${s.color}88` }} />
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.1px' }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color, letterSpacing: '-0.8px' }}>{s.stats.mean}</div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4, fontWeight: 600 }}>{s.count} pts &nbsp;·&nbsp; σ {s.stats.std}</div>
          </div>
        ))}
      </div>

      {/* Correlations scatter */}
      {mergedData?.length > 0 && (
        <CorrelationChart data={mergedData} />
      )}
    </div>
  );
}

/* ── Multi-sensor Analysis Summary ── */
function AnalysisSummaryMulti({ sensorData, valueKeys, sensors }) {
  const insights = useMemo(() => {
    return sensors.map(s => {
      const data = sensorData[s.id];
      const vKey = getValueKey(s.id, valueKeys);
      if (!data?.length) return null;
      const stats = computeStats(data, vKey);
      return { sensor: s, stats, count: data.length };
    }).filter(Boolean);
  }, [sensorData, valueKeys, sensors]);

  if (insights.length === 0) return null;

  return (
      <div className="card fade-in" style={{ padding: 28 }}>
      <h3 className="section-title" style={{ marginBottom: 20 }}>Analysis Summary</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {insights.map(({ sensor, stats, count }) => (
          <div key={sensor.id} style={{
            padding: 16, borderRadius: 16, border: `1px solid ${sensor.color}22`,
            background: `${sensor.color}08`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: sensor.color }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{sensor.label}</span>
              <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>{count} records</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 12 }}>
              <StatBox label="Mean" value={stats.mean} />
              <StatBox label="Std Dev" value={stats.std} />
              <StatBox label="Median" value={stats.median} />
              <StatBox label="Min" value={stats.min} />
              <StatBox label="Max" value={stats.max} />
              <StatBox label="Range" value={(stats.max - stats.min).toFixed(3)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatBox({ label, value }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{value}</div>
    </div>
  );
}

/* ── Alerts Page (ML GMM Threshold-based) ── */
function AlertsView({ sensorData, valueKeys }) {
  const [mlThresholds, setMlThresholds] = useState(null);

  useEffect(() => {
    loadThresholdResults().then(setMlThresholds);
  }, []);

  const allAlerts = useMemo(() => {
    if (!mlThresholds) return [];
    const items = [];
    SENSORS.forEach(sensor => {
      const data = sensorData[sensor.id];
      const vKey = getValueKey(sensor.id, valueKeys);
      if (!data?.length || !vKey) return;

      const gmm = mlThresholds[sensor.id]?.gmm_thresholds;
      if (!gmm) return;

      const wLow = gmm.thresholds.warning_low;
      const wHigh = gmm.thresholds.warning_high;

      data.forEach(d => {
        const val = Number(d[vKey]) || 0;
        let status = null;
        if (val < wLow * 0.8 || val > wHigh * 1.2) status = 'danger';
        else if (val < wLow || val > wHigh) status = 'warning';
        if (status) {
          items.push({
            sensor: sensor.label,
            sensorColor: sensor.color,
            value: val.toFixed(2),
            unit: sensor.unit,
            status,
            time: d.Timestamp,
            threshold: `GMM [${wLow.toFixed(1)}, ${wHigh.toFixed(1)}]`,
          });
        }
      });
    });
    return items.slice(-200).reverse();
  }, [sensorData, valueKeys, mlThresholds]);

  const statusColors = { warning: '#f59e0b', danger: '#ef4444' };

  return (
    <div className="card" style={{ padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h3 className="section-title" style={{ marginBottom: 4 }}>Sensor Alerts <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-faint)', marginLeft: 8 }}>({allAlerts.length})</span></h3>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 500 }}>Threshold alerts learned from Gaussian Mixture Models</p>
        </div>
      </div>
      <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
        {allAlerts.length === 0 && (
          <p style={{ color: '#94a3b8', textAlign: 'center', padding: 40 }}>
            {mlThresholds ? 'No alerts — all readings within ML threshold range.' : 'Loading ML thresholds...'}
          </p>
        )}
        {allAlerts.map((a, i) => (
          <div
            key={i}
            className={`alert-item ${a.status === 'danger' ? 'alert-danger' : 'alert-warning'} fade-in`}
            style={{ animationDelay: `${i * 0.02}s` }}
          >
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.sensorColor }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 700, color: statusColors[a.status], fontSize: 13 }}>
                {a.status.toUpperCase()}
              </span>
              <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>
                {a.sensor} = {a.value} {a.unit}
              </span>
              <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 8 }}>{a.threshold}</span>
            </div>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{a.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Settings Page ── */
function SettingsView() {
  const [trainingSummary, setTrainingSummary] = useState(null);

  useEffect(() => {
    fetch('/ml_results/training_summary.json')
      .then(r => r.ok ? r.json() : null)
      .then(setTrainingSummary)
      .catch(() => null);
  }, []);

  const mlModels = [
    { name: 'Temporal Trend Analysis', techniques: 'Linear Regression, Polynomial, Random Forest, Gradient Boosting, Holt-Winters', icon: '📈' },
    { name: 'Anomaly Detection', techniques: 'Isolation Forest, Local Outlier Factor, One-Class SVM, DBSCAN', icon: '🔍' },
    { name: 'Threshold Classification', techniques: 'GMM threshold learning, Decision Tree, Random Forest Classifier', icon: '⚠️' },
    { name: 'Correlation Analysis', techniques: 'RF/GB feature importance, Mutual Information, PCA, Pearson/Spearman', icon: '🔗' },
    { name: 'Behavior Clustering', techniques: 'K-Means (silhouette optimal k), GMM clustering, Hierarchical', icon: '🧩' },
  ];

  const sensors = [
    { id: 'Turbidity', path: 'test-data/Turbidity', unit: 'NTU' },
    { id: 'pH', path: 'test-data/pH', unit: 'pH' },
    { id: 'Temperature', path: 'test-data/Temperature', unit: '°C (converted from °F)' },
    { id: 'TDS', path: 'test-data/TDS', unit: 'ppm' },
    { id: 'Light', path: 'test-data/Light', unit: 'lux' },
    { id: 'Axis (Motion)', path: 'test-data/Axis', unit: 'X/Y/Z → magnitude' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader title="System Information" subtitle="IoT buoy configuration, ML pipeline details, and data architecture" />

      {/* System Architecture */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 24, borderRadius: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#2563eb22,#0891b222)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Database style={{ width: 18, height: 18, color: '#2563eb' }} />
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>Firebase Realtime Database</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['Project', 'iot-buoy'],
              ['Region', 'asia-southeast1'],
              ['Database URL', 'iot-buoy-default-rtdb'],
              ['Hosting', 'iot-buoy.web.app'],
              ['Real-time method', 'onChildAdded + debounce 500ms'],
              ['Historical load', 'get() limitToLast(100) per sensor'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                <span style={{ color: 'var(--text-faint)', fontWeight: 600, minWidth: 140 }}>{k}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontFamily: 'monospace', fontSize: 11 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 24, borderRadius: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#05966922,#0891b222)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Activity style={{ width: 18, height: 18, color: '#059669' }} />
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>Sensor Configuration</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {sensors.map(s => (
              <div key={s.id} style={{ display: 'flex', gap: 12, fontSize: 12, alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--text-faint)', fontWeight: 600, minWidth: 120 }}>{s.id}</span>
                <div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontFamily: 'monospace', fontSize: 10 }}>{s.path}</div>
                  <div style={{ color: 'var(--text-faint)', fontSize: 10 }}>{s.unit}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ML Pipeline */}
      <div className="card" style={{ padding: 24, borderRadius: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#7c3aed22,#2563eb22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Cpu style={{ width: 18, height: 18, color: '#7c3aed' }} />
          </div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>ML Training Pipeline</h3>
            {trainingSummary && (
              <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                Last trained: {trainingSummary.training_timestamp} &nbsp;·&nbsp; {trainingSummary.models_trained} models &nbsp;·&nbsp; {(trainingSummary.total_training_time_seconds).toFixed(0)}s &nbsp;·&nbsp; {(trainingSummary.sensors?.length ?? 0)} sensors &nbsp;·&nbsp; ~{Object.values(trainingSummary.value_columns ?? {}).length > 0 ? '15,000' : '—'} records/sensor
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
          {mlModels.map((m, i) => (
            <div key={i} style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
                <span style={{ marginRight: 8 }}>{m.icon}</span>Model {i + 1}: {m.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.6 }}>{m.techniques}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tech stack */}
      <div className="card" style={{ padding: 24, borderRadius: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#f59e0b22,#ef444422)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Info style={{ width: 18, height: 18, color: '#f59e0b' }} />
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>Technology Stack</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {[
            ['Frontend', 'React 18 + Vite'],
            ['Charts', 'Recharts'],
            ['Database', 'Firebase RTDB'],
            ['Hosting', 'Firebase Hosting'],
            ['ML Framework', 'scikit-learn + statsmodels'],
            ['ML Language', 'Python 3'],
            ['Data Fetch', 'Firebase REST API'],
            ['Serialization', 'joblib (.joblib files)'],
          ].map(([cat, val]) => (
            <div key={cat} style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{cat}</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>{val}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
