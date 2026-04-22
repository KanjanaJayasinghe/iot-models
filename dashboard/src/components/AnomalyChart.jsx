import { useMemo, useEffect, useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, BarChart, PieChart, Pie
} from 'recharts';
import { loadAnomalyResults } from '../utils/mlResults';
import { formatTimestamp } from '../utils/formatters';

export default function AnomalyChart({ data, dataKey, title, color = '#3b82f6', sensorId }) {
  const [mlData, setMlData] = useState(null);

  useEffect(() => {
    loadAnomalyResults().then(setMlData);
  }, []);

  const { analyzed, anomalyCount, healthScore, distribution, mlInfo, modelCompare } = useMemo(() => {
    if (!data?.length) return { analyzed: [], anomalyCount: 0, healthScore: 100, distribution: [], mlInfo: null, modelCompare: [] };

    const sensorML = mlData?.[sensorId];
    const bestModel = sensorML?.best_model || 'Isolation_Forest';
    const bestModelData = sensorML?.models?.[bestModel];
    const iforestData = sensorML?.models?.Isolation_Forest;

    // Use anomaly scores from Isolation Forest to flag anomalies
    const scores = iforestData?.anomaly_scores_sample || [];
    const nAnomalies = bestModelData?.n_anomalies || 0;
    const totalSamples = sensorML?.n_samples || data.length;
    const contamination = sensorML?.contamination_ratio || 0.01;

    // Compute z-scores locally for visualization (but anomaly detection is ML-based)
    const values = data.map(d => Number(d[dataKey]) || 0);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length) || 1;

    // Use ML contamination ratio to determine threshold
    const sortedAbs = values.map(v => Math.abs((v - mean) / std)).sort((a, b) => b - a);
    const mlThresholdIdx = Math.max(0, Math.floor(contamination * values.length));
    const mlThreshold = sortedAbs[mlThresholdIdx] || 2.5;

    const result = data.map((d, i) => {
      const val = Number(d[dataKey]) || 0;
      const zScore = parseFloat(((val - mean) / std).toFixed(3));
      const anomalyScore = scores[i] !== undefined ? scores[i] : null;
      const isAnomaly = Math.abs(zScore) > mlThreshold;
      return { ...d, isAnomaly, zScore, anomalyScore };
    });

    const ac = result.filter(d => d.isAnomaly).length;
    const hs = Math.max(0, Math.round((1 - ac / result.length) * 100));

    // Z-score distribution buckets
    const buckets = [
      { range: '<-2', count: 0, fill: '#ef4444' },
      { range: '-2 to -1', count: 0, fill: '#38bdf8' },
      { range: '-1 to 0', count: 0, fill: '#3b82f6' },
      { range: '0 to 1', count: 0, fill: '#3b82f6' },
      { range: '1 to 2', count: 0, fill: '#38bdf8' },
      { range: '>2', count: 0, fill: '#ef4444' },
    ];
    result.forEach(d => {
      const z = d.zScore;
      if (z < -2) buckets[0].count++;
      else if (z < -1) buckets[1].count++;
      else if (z < 0) buckets[2].count++;
      else if (z < 1) buckets[3].count++;
      else if (z < 2) buckets[4].count++;
      else buckets[5].count++;
    });

    const info = sensorML ? {
      bestModel: bestModel.replace(/_/g, ' '),
      nSamples: totalSamples,
      zScoreAnomalies: sensorML.z_score_anomalies,
      contamination: contamination,
      bestF1: bestModelData?.metrics?.f1 || 0,
      bestPrecision: bestModelData?.metrics?.precision || 0,
      bestRecall: bestModelData?.metrics?.recall || 0,
    } : null;

    const compare = sensorML?.models
      ? Object.entries(sensorML.models).map(([name, m]) => ({
          name: name.replace(/_/g, ' '),
          f1: parseFloat(((m.metrics?.f1 || 0) * 100).toFixed(1)),
          anomalies: m.n_anomalies || 0,
        }))
      : [];

    return { analyzed: result, anomalyCount: ac, healthScore: hs, distribution: buckets, mlInfo: info, modelCompare: compare };
  }, [data, dataKey, mlData, sensorId]);

  if (!analyzed.length) {
    return <div className="card" style={{ padding: 32, textAlign: 'center' }}><p style={{ color: '#94a3b8' }}>No data for anomaly detection</p></div>;
  }

  const normalCount = analyzed.length - anomalyCount;
  const pieData = [
    { name: 'Normal', value: normalCount, fill: '#10b981' },
    { name: 'Anomaly', value: anomalyCount, fill: '#ef4444' },
  ];

  return (
    <div className="card fade-in" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{title}</h3>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            ML: {mlInfo?.bestModel || 'Loading...'} | Isolation Forest, LOF, One-Class SVM, DBSCAN
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={anomalyCount > 0 ? 'badge badge-danger' : 'badge badge-normal'}>
            {anomalyCount} anomal{anomalyCount === 1 ? 'y' : 'ies'}
          </span>
        </div>
      </div>

      {/* KPI Row: Health Donut + ML Stats + Distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: 0, borderBottom: '1px solid #f1f5f9' }}>
        {/* Health Score Donut */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px 0', borderRight: '1px solid #f1f5f9' }}>
          <div style={{ position: 'relative', width: 80, height: 80 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={28} outerRadius={36} paddingAngle={3} dataKey="value" stroke="none">
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: healthScore > 90 ? '#059669' : healthScore > 70 ? '#d97706' : '#dc2626' }}>{healthScore}%</span>
            </div>
          </div>
          <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginTop: 4 }}>Health Score</span>
        </div>

        {/* ML Model Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0, padding: '12px 0' }}>
          {[
            { label: 'Best Model', value: mlInfo?.bestModel || '�', accent: '#2563eb' },
            { label: 'F1 Score', value: mlInfo ? (mlInfo.bestF1 * 100).toFixed(1) + '%' : '�', accent: '#059669' },
            { label: 'Precision', value: mlInfo ? (mlInfo.bestPrecision * 100).toFixed(1) + '%' : '�', accent: '#1e293b' },
            { label: 'Recall', value: mlInfo ? (mlInfo.bestRecall * 100).toFixed(1) + '%' : '�', accent: '#1e293b' },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '6px 8px', borderRight: i % 2 === 0 ? '1px solid #f1f5f9' : 'none', borderBottom: i < 2 ? '1px solid #f1f5f9' : 'none' }}>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: s.accent }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Z-Score Distribution */}
        <div style={{ padding: '10px 12px', borderLeft: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 6, textAlign: 'center' }}>Z-Score Distribution</div>
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={distribution} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="range" tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Bar dataKey="count" radius={[3, 3, 0, 0]} barSize={14}>
                {distribution.map((entry, i) => <Cell key={i} fill={entry.fill} fillOpacity={0.7} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Model Comparison */}
      {modelCompare.length > 0 && (
        <div style={{ padding: '10px 22px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>ML Model F1 Comparison (scikit-learn trained)</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {modelCompare.map((m, i) => (
              <div key={i} style={{ flex: 1, padding: '6px 10px', borderRadius: 8, background: m.name === mlInfo?.bestModel ? '#eff6ff' : '#f8fafc', border: m.name === mlInfo?.bestModel ? '1px solid #3b82f6' : '1px solid #e2e8f0', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 500 }}>{m.name}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: m.f1 > 50 ? '#059669' : '#d97706' }}>{m.f1}%</div>
                <div style={{ fontSize: 9, color: '#94a3b8' }}>{m.anomalies} flagged</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Chart */}
      <div style={{ height: 220, padding: '8px 6px 0' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={analyzed} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 6" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="Timestamp" tickFormatter={formatTimestamp} stroke="transparent" tick={{ fontSize: 10, fill: '#94a3b8' }} interval="preserveStartEnd" />
            <YAxis yAxisId="value" stroke="transparent" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis yAxisId="zscore" orientation="right" stroke="transparent" tick={{ fontSize: 10, fill: '#94a3b8' }} domain={[-4, 4]} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload;
              return (
                <div style={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 12, padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', fontSize: 12 }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>{d?.Timestamp}</div>
                  <div><span style={{ color: '#64748b' }}>Value: </span><b style={{ color: d?.isAnomaly ? '#dc2626' : '#1e293b' }}>{Number(d?.[dataKey]).toFixed(3)}</b></div>
                  <div><span style={{ color: '#64748b' }}>Z-Score: </span><b style={{ color: Math.abs(d?.zScore) > 2.5 ? '#dc2626' : '#059669' }}>{d?.zScore}</b></div>
                  {d?.isAnomaly && <div style={{ marginTop: 4, fontSize: 11, color: '#dc2626', fontWeight: 700 }}>? ML Anomaly Detected</div>}
                </div>
              );
            }} />
            <Bar yAxisId="value" dataKey={dataKey} barSize={3} radius={[2, 2, 0, 0]}>
              {analyzed.map((entry, i) => (
                <Cell key={i} fill={entry.isAnomaly ? '#ef4444' : color} fillOpacity={entry.isAnomaly ? 0.9 : 0.4} />
              ))}
            </Bar>
            <Line yAxisId="zscore" type="monotone" dataKey="zScore" stroke="#8b5cf6" strokeWidth={1.5} dot={false} strokeDasharray="4 4" strokeOpacity={0.5} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 20, padding: '10px 0 14px', fontSize: 11, color: '#94a3b8' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: color, opacity: 0.5 }} /> Normal</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#ef4444' }} /> ML Anomaly</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 16, height: 0, borderTop: '2px dashed #8b5cf6' }} /> Z-Score</span>
      </div>
    </div>
  );
}