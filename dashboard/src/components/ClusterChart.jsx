import { useMemo, useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { loadClusteringResults } from '../utils/mlResults';

const CLUSTER_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];
const CLUSTER_BG = ['#eff6ff', '#ecfdf5', '#f5f3ff', '#fffbeb', '#fef2f2', '#ecfeff', '#fdf2f8'];

export default function ClusterChart({ data, dataKey, title, sensorId }) {
  const [mlData, setMlData] = useState(null);

  useEffect(() => {
    loadClusteringResults().then(setMlData);
  }, []);

  const { summary, radarData, total, mlInfo } = useMemo(() => {
    if (!data?.length) return { summary: [], radarData: [], total: 0, mlInfo: null };

    const perSensor = mlData?.per_sensor?.[sensorId];
    if (!perSensor) {
      // Fallback: no ML data yet
      return { summary: [], radarData: [], total: 0, mlInfo: null };
    }

    const optimalK = perSensor.optimal_k;
    const silhouette = perSensor.silhouette;
    const centroids = perSensor.centroids || [];
    const labelNames = perSensor.label_names || {};
    const clusterSizes = perSensor.cluster_sizes || {};

    // Build summary from ML model output
    const values = data.map(d => Number(d[dataKey]) || 0);
    const totalPts = Object.values(clusterSizes).reduce((a, b) => a + b, 0);
    const sum = centroids.map((centroid, idx) => {
      const label = labelNames[String(idx)] || `Cluster ${idx}`;
      const count = clusterSizes[String(idx)] || 0;
      const percentage = totalPts > 0 ? parseFloat(((count / totalPts) * 100).toFixed(1)) : 0;
      return {
        name: label,
        count,
        mean: parseFloat(centroid.toFixed(3)),
        centroid: parseFloat(centroid.toFixed(3)),
        percentage,
        idx,
      };
    }).filter(c => c.count > 0).sort((a, b) => a.centroid - b.centroid);

    // Radar data
    const maxMean = Math.max(...sum.map(s => Math.abs(s.mean)), 1);
    const maxCount = Math.max(...sum.map(s => s.count), 1);
    const radar = [
      { axis: 'Centroid', ...Object.fromEntries(sum.map((s, i) => [`c${i}`, ((Math.abs(s.mean) / maxMean) * 100).toFixed(0)])) },
      { axis: 'Count', ...Object.fromEntries(sum.map((s, i) => [`c${i}`, ((s.count / maxCount) * 100).toFixed(0)])) },
      { axis: 'Share %', ...Object.fromEntries(sum.map((s, i) => [`c${i}`, s.percentage.toFixed(0)])) },
    ];

    const info = {
      optimalK,
      silhouette: silhouette.toFixed(4),
      totalSamples: totalPts,
      method: 'K-Means (scikit-learn)',
    };

    return { summary: sum, radarData: radar, total: totalPts, mlInfo: info };
  }, [data, dataKey, mlData, sensorId]);

  if (!summary.length) {
    return <div className="card" style={{ padding: 32, textAlign: 'center' }}><p style={{ color: '#94a3b8' }}>No ML clustering data available</p></div>;
  }

  return (
    <div className="card fade-in" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{title}</h3>
        <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
          ML: {mlInfo?.method} | Optimal k={mlInfo?.optimalK} | Silhouette={mlInfo?.silhouette} | {total} samples
        </p>
      </div>

      {/* ML KPI Row */}
      {mlInfo && (
        <div style={{ display: 'flex', gap: 0, padding: '10px 22px', borderBottom: '1px solid #f1f5f9' }}>
          {[
            { label: 'Algorithm', value: 'K-Means', accent: '#2563eb' },
            { label: 'Optimal K', value: mlInfo.optimalK, accent: '#059669' },
            { label: 'Silhouette', value: mlInfo.silhouette, accent: parseFloat(mlInfo.silhouette) > 0.5 ? '#059669' : '#d97706' },
            { label: 'Samples', value: mlInfo.totalSamples, accent: '#1e293b' },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', borderRight: i < 3 ? '1px solid #f1f5f9' : 'none' }}>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: s.accent }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Cluster KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(summary.length, 5)}, 1fr)`, gap: 0, borderBottom: '1px solid #f1f5f9' }}>
        {summary.map((s, i) => (
          <div key={s.name} style={{ padding: '14px 16px', borderRight: i < summary.length - 1 ? '1px solid #f1f5f9' : 'none', background: CLUSTER_BG[i % CLUSTER_BG.length] }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: CLUSTER_COLORS[i % CLUSTER_COLORS.length] }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{s.name}</span>
              <span style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 800, color: CLUSTER_COLORS[i % CLUSTER_COLORS.length] }}>{s.percentage}%</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
              {[
                { label: 'Count', value: s.count },
                { label: 'Centroid', value: s.centroid },
              ].map((stat, j) => (
                <div key={j} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 500 }}>{stat.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{stat.value}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, padding: '12px 8px' }}>
        {/* Bar Chart */}
        <div style={{ height: 200 }}>
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textAlign: 'center', marginBottom: 4 }}>Cluster Size</div>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={summary} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 6" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 10, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 11 }}>
                    <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{d.name}</div>
                    <div>Count: <b>{d.count}</b> ({d.percentage}%)</div>
                    <div>Centroid: <b>{d.centroid}</b></div>
                  </div>
                );
              }} />
              <Bar dataKey="count" radius={[8, 8, 0, 0]} barSize={36}>
                {summary.map((_, i) => <Cell key={i} fill={CLUSTER_COLORS[i % CLUSTER_COLORS.length]} fillOpacity={0.75} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Donut Chart */}
        <div style={{ height: 200, position: 'relative' }}>
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textAlign: 'center', marginBottom: 4 }}>Distribution</div>
          <ResponsiveContainer width="100%" height="90%">
            <PieChart>
              <Pie data={summary} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={4} dataKey="count" nameKey="name" stroke="none">
                {summary.map((_, i) => <Cell key={i} fill={CLUSTER_COLORS[i % CLUSTER_COLORS.length]} fillOpacity={0.85} />)}
              </Pie>
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div style={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 10, padding: '6px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 11, fontWeight: 600 }}>
                    {payload[0].payload.name}: {payload[0].payload.percentage}%
                  </div>
                );
              }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -38%)', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>{total}</div>
            <div style={{ fontSize: 9, color: '#94a3b8' }}>total</div>
          </div>
        </div>

        {/* Radar Chart */}
        <div style={{ height: 200 }}>
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textAlign: 'center', marginBottom: 4 }}>Cluster Profile</div>
          <ResponsiveContainer width="100%" height="90%">
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid stroke="#e8ecf1" />
              <PolarAngleAxis dataKey="axis" tick={{ fontSize: 9, fill: '#94a3b8' }} />
              <PolarRadiusAxis tick={false} axisLine={false} />
              {summary.map((_, i) => (
                <Radar key={i} name={summary[i]?.name} dataKey={`c${i}`} stroke={CLUSTER_COLORS[i % CLUSTER_COLORS.length]} fill={CLUSTER_COLORS[i % CLUSTER_COLORS.length]} fillOpacity={0.15} strokeWidth={2} />
              ))}
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div style={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 10, padding: '6px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 11 }}>
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>{payload[0]?.payload?.axis}</div>
                    {payload.map((p, i) => (
                      <div key={i} style={{ color: p.color }}>{p.name}: <b>{p.value}%</b></div>
                    ))}
                  </div>
                );
              }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}