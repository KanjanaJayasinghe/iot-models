import { useMemo, useState, useEffect } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ZAxis, Cell, BarChart, Bar
} from 'recharts';
import { loadCorrelationResults } from '../utils/mlResults';
import { SENSORS } from '../config/sensors';

export default function CorrelationChart({ data }) {
  const [mlData, setMlData] = useState(null);

  useEffect(() => {
    loadCorrelationResults().then(setMlData);
  }, []);

  const available = useMemo(() => {
    if (!data?.length) return [];
    return SENSORS.filter(s => data.some(d => d[s.id] !== undefined));
  }, [data]);

  const [xSensor, setXSensor] = useState(null);
  const [ySensor, setYSensor] = useState(null);

  const xId = xSensor || available[0]?.id;
  const yId = ySensor || available[1]?.id;
  const xConfig = SENSORS.find(s => s.id === xId);
  const yConfig = SENSORS.find(s => s.id === yId);

  // Use ML Pearson correlation instead of JS calculation
  const correlation = useMemo(() => {
    if (!mlData || !xId || !yId) return 0;
    const pearson = mlData?.correlation_matrices?.pearson;
    if (!pearson?.[xId]?.[yId]) return 0;
    const val = pearson[xId][yId];
    return isNaN(val) ? 0 : parseFloat(val.toFixed(4));
  }, [mlData, xId, yId]);

  // Spearman correlation from ML
  const spearmanCorr = useMemo(() => {
    if (!mlData || !xId || !yId) return 0;
    const spearman = mlData?.correlation_matrices?.spearman;
    if (!spearman?.[xId]?.[yId]) return 0;
    const val = spearman[xId][yId];
    return isNaN(val) ? 0 : parseFloat(val.toFixed(4));
  }, [mlData, xId, yId]);

  // Feature importance from ML for the selected Y sensor
  const featureImportance = useMemo(() => {
    if (!mlData || !yId) return [];
    const fi = mlData?.feature_importance?.[yId];
    if (!fi) return [];
    const rfImp = fi.rf_importances || {};
    return Object.entries(rfImp)
      .filter(([k]) => k !== yId)
      .map(([sensor, imp]) => ({
        name: SENSORS.find(s => s.id === sensor)?.label || sensor,
        importance: parseFloat((imp * 100).toFixed(1)),
        fill: SENSORS.find(s => s.id === sensor)?.color || '#94a3b8',
      }))
      .sort((a, b) => b.importance - a.importance);
  }, [mlData, yId]);

  // PCA info from ML
  const pcaInfo = useMemo(() => {
    if (!mlData?.pca) return null;
    return {
      explained: mlData.pca.explained_variance?.map((v, i) => ({
        name: `PC${i + 1}`,
        variance: parseFloat((v * 100).toFixed(1)),
      })),
      cumulative: mlData.pca.cumulative_variance,
      nComponents90: mlData.pca.n_components_90pct,
    };
  }, [mlData]);

  const scatterData = useMemo(() => {
    if (!data?.length || !xId || !yId) return [];
    const raw = data
      .filter(d => d[xId] !== undefined && d[yId] !== undefined)
      .map(d => ({
        x: parseFloat(d[xId]) || 0,
        y: parseFloat(d[yId]) || 0,
        timestamp: d.Timestamp,
      }));
    // Downsample to 80 points for chart performance
    if (raw.length > 80) {
      const step = Math.ceil(raw.length / 80);
      return raw.filter((_, i) => i % step === 0);
    }
    return raw;
  }, [data, xId, yId]);

  const corrLevel = Math.abs(correlation);
  const corrLabel = corrLevel > 0.7 ? 'Strong' : corrLevel > 0.4 ? 'Moderate' : 'Weak';
  const corrColor = corrLevel > 0.7 ? '#10b981' : corrLevel > 0.4 ? '#38bdf8' : '#94a3b8';

  if (!scatterData.length || !xConfig || !yConfig) {
    return (
      <div className="card fade-in" style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ color: '#94a3b8' }}>Insufficient data for correlation analysis.</p>
      </div>
    );
  }

  return (
    <div className="card fade-in" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
              {xConfig.label} vs {yConfig.label} � ML Correlation
            </h3>
            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              RF/GB Feature Importance, Mutual Information, PCA (scikit-learn trained)
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <select value={xId} onChange={e => setXSensor(e.target.value)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 600, color: '#475569', background: '#f8fafc' }}>
              {available.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>vs</span>
            <select value={yId} onChange={e => setYSensor(e.target.value)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 600, color: '#475569', background: '#f8fafc' }}>
              {available.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Correlation KPI Row */}
      <div style={{ display: 'flex', gap: 0, padding: '12px 22px', borderBottom: '1px solid #f1f5f9' }}>
        {[
          { label: 'Pearson r', value: correlation, accent: corrColor },
          { label: 'Spearman ?', value: spearmanCorr, accent: Math.abs(spearmanCorr) > 0.4 ? '#10b981' : '#94a3b8' },
          { label: 'Strength', value: corrLabel, accent: corrColor },
          { label: 'Direction', value: correlation > 0 ? 'Positive' : correlation < 0 ? 'Negative' : 'None', accent: correlation > 0 ? '#059669' : '#dc2626' },
          { label: 'ML R� (RF)', value: mlData?.feature_importance?.[yId]?.rf_cv_r2 != null ? (mlData.feature_importance[yId].rf_cv_r2 > 0 ? (mlData.feature_importance[yId].rf_cv_r2 * 100).toFixed(1) + '%' : '<0') : '�', accent: '#2563eb' },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', borderRight: i < 4 ? '1px solid #f1f5f9' : 'none' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: s.accent }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
        {/* Scatter Plot */}
        <div style={{ padding: '12px', borderRight: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 8, textAlign: 'center' }}>Scatter Plot</div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.7} />
                <XAxis dataKey="x" name={xConfig.label} stroke="#cbd5e1" tick={{ fontSize: 11, fill: '#94a3b8' }}
                  label={{ value: `${xConfig.label} (${xConfig.unit})`, position: 'bottom', offset: 0, fill: '#94a3b8', fontSize: 11 }} />
                <YAxis dataKey="y" name={yConfig.label} stroke="#cbd5e1" tick={{ fontSize: 11, fill: '#94a3b8' }}
                  label={{ value: `${yConfig.label} (${yConfig.unit})`, angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }} />
                <ZAxis range={[45, 45]} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(12px)', border: '1px solid #e2e8f0', borderRadius: 14, padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}>
                      <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>{d.timestamp}</p>
                      <p style={{ fontSize: 12 }}><span style={{ color: '#64748b' }}>{xConfig.label}:</span><span style={{ fontWeight: 700, color: xConfig.color, marginLeft: 4 }}>{d.x}</span></p>
                      <p style={{ fontSize: 12 }}><span style={{ color: '#64748b' }}>{yConfig.label}:</span><span style={{ fontWeight: 700, color: yConfig.color, marginLeft: 4 }}>{d.y}</span></p>
                    </div>
                  );
                }} />
                <Scatter name="Readings" data={scatterData}>
                  {scatterData.map((_, i) => (
                    <Cell key={i} fill={`hsl(${(i / scatterData.length) * 60 + 230}, 65%, 55%)`} fillOpacity={0.6} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Feature Importance (RF) */}
        <div style={{ padding: '12px' }}>
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 8, textAlign: 'center' }}>
            RF Feature Importance for {yConfig.label} (ML trained)
          </div>
          {featureImportance.length > 0 ? (
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={featureImportance} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 6" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                  <Bar dataKey="importance" name="Importance %" radius={[0, 6, 6, 0]} barSize={16} isAnimationActive={false}>
                    {featureImportance.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: '#94a3b8', fontSize: 12 }}>Loading ML feature importance...</p>
            </div>
          )}
        </div>
      </div>

      {/* PCA Summary */}
      {pcaInfo && (
        <div style={{ padding: '14px 22px', borderTop: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 8 }}>PCA Analysis (ML) � {pcaInfo.nComponents90} components explain 90% variance</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {pcaInfo.explained?.filter(p => p.variance > 0).map((p, i) => (
              <div key={i} style={{ flex: 1, padding: '8px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{p.name}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#2563eb' }}>{p.variance}%</div>
                <div style={{ height: 4, borderRadius: 2, background: '#e2e8f0', marginTop: 4 }}>
                  <div style={{ height: '100%', borderRadius: 2, background: '#3b82f6', width: `${p.variance}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}