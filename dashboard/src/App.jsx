import { useState, useMemo, useEffect } from 'react';
import { Waves, ShieldAlert } from 'lucide-react';
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
import { loadThresholdResults } from './utils/mlResults';

export default function App() {
  const { sensorData, valueKeys, mergedData, loading, error, lastUpdated } = useFirebaseData();
  const [page, setPage] = useState('dashboard');

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg,#3b82f6,#06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 12px 32px rgba(59,130,246,0.3)' }}>
            <Waves style={{ width: 28, height: 28, color: 'white' }} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>Loading Dashboard</h2>
          <p style={{ fontSize: 13, color: '#94a3b8' }}>Connecting to Firebase sensors...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
        <div className="card" style={{ padding: 40, maxWidth: 400, textAlign: 'center' }}>
          <ShieldAlert style={{ width: 48, height: 48, color: '#ef4444', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Connection Error</h2>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>{error}</p>
          <button onClick={() => window.location.reload()} style={{ padding: '10px 28px', borderRadius: 12, background: '#3b82f6', color: 'white', fontWeight: 700, border: 'none', cursor: 'pointer' }}>Retry</button>
        </div>
      </div>
    );
  }

  const now = lastUpdated || new Date();

  return (
    <div className={`app-layout ${page !== 'dashboard' ? 'no-aside' : ''}`}>
      <Sidebar active={page} onNavigate={setPage} />

      <div className="top-header">
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b' }}>Smart Monitoring Dashboard</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="online-badge">
            <span className="online-dot" />
            Online
            <Waves style={{ width: 18, height: 18, color: '#10b981' }} />
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>
              Date, {now.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: '2-digit' })}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
              {now.toLocaleTimeString()}
            </div>
          </div>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#bfdbfe,#93c5fd)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#1e40af' }}>
            U
          </div>
        </div>
      </div>

      <main style={{ padding: '20px 24px', overflow: 'auto' }}>
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
        <aside style={{ padding: '20px 16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Sensor Cards — 3 per row, compact */}
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Sensor:</span>
      <button
        onClick={() => onSelect(null)}
        style={{
          padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
          border: '2px solid #3b82f6', cursor: 'pointer', transition: 'all 0.2s',
          background: !selected ? '#3b82f6' : 'transparent',
          color: !selected ? 'white' : '#3b82f6',
        }}
      >All</button>
      {available.map(s => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          style={{
            padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            border: `2px solid ${s.color}`, cursor: 'pointer', transition: 'all 0.2s',
            background: selected === s.id ? s.color : 'transparent',
            color: selected === s.id ? 'white' : s.color,
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
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', letterSpacing: '-0.02em' }}>{title}</h2>
      <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>{subtitle}</p>
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
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(sensorStats.length, 6)}, 1fr)`, gap: 12 }}>
        {sensorStats.map(s => (
          <div key={s.id} className="card" style={{ padding: '14px 16px', borderLeft: `3px solid ${s.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{s.label}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.stats.mean}</div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{s.count} pts | σ {s.stats.std}</div>
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
    <div className="card fade-in" style={{ padding: 24 }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>ML Analysis Summary</h3>
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
    <div className="card" style={{ padding: 24 }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
        ML Alerts — GMM Threshold Classification ({allAlerts.length})
      </h3>
      <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>Thresholds learned via Gaussian Mixture Models (scikit-learn)</p>
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
  return (
    <div className="card" style={{ padding: 40, textAlign: 'center' }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Settings</h3>
      <p style={{ fontSize: 13, color: '#94a3b8' }}>Dashboard configuration coming soon.</p>
    </div>
  );
}
