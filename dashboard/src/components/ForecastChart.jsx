import { useMemo, useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceDot, BarChart, Bar, Cell
} from 'recharts';
import { loadTemporalResults } from '../utils/mlResults';
import { formatTimestamp } from '../utils/formatters';

export default function ForecastChart({ data, dataKey, title, color = '#3b82f6', unit = '', sensorId }) {
  const [mlData, setMlData] = useState(null);

  useEffect(() => {
    loadTemporalResults().then(setMlData);
  }, []);

  const { chartData, splitIndex, mlStats, forecastValues, modelCompare } = useMemo(() => {
    if (!data?.length) return { chartData: [], splitIndex: 0, mlStats: null, forecastValues: [], modelCompare: [] };

    const sensorML = mlData?.[sensorId];
    const regression = sensorML?.regression;
    const hw = sensorML?.holtwinters;

    const hwForecast = hw?.forecast || [];
    const lastTs = data[data.length - 1]?.ts || Date.now();
    const interval = data.length > 1 ? (data[data.length - 1].ts - data[data.length - 2].ts) : 60000;

    const historical = data.map(d => ({
      Timestamp: d.Timestamp,
      actual: Number(d[dataKey]) || 0,
      type: 'historical',
    }));

    const predicted = hwForecast.map((val, i) => ({
      Timestamp: new Date(lastTs + interval * (i + 1)).toISOString().replace('T', ' ').slice(0, 19),
      forecast: parseFloat(val.toFixed(3)),
      type: 'forecast',
    }));

    const combined = [...historical, ...predicted];

    const stats = regression ? {
      bestModel: regression.best_model?.replace(/_/g, ' '),
      r2: regression.all_results?.[regression.best_model]?.r2,
      mae: regression.all_results?.[regression.best_model]?.mae,
      rmse: regression.all_results?.[regression.best_model]?.rmse,
      nSamples: regression.n_samples,
      nFeatures: regression.n_features,
    } : null;

    const compare = regression?.all_results
      ? Object.entries(regression.all_results).map(([name, res]) => ({
          name: name.replace(/_/g, ' '),
          r2: Math.max(0, parseFloat((res.r2 * 100).toFixed(1))),
        }))
      : [];

    return { chartData: combined, splitIndex: historical.length, mlStats: stats, forecastValues: hwForecast, modelCompare: compare };
  }, [data, dataKey, mlData, sensorId]);

  if (!chartData.length) {
    return <div className="card" style={{ padding: 32, textAlign: 'center' }}><p style={{ color: '#94a3b8' }}>No data for forecasting</p></div>;
  }

  const forecastMean = forecastValues.length ? (forecastValues.reduce((a, b) => a + b, 0) / forecastValues.length) : 0;
  const forecastTrend = forecastValues.length > 1 ? (forecastValues[forecastValues.length - 1] > forecastValues[0] ? 'up' : 'down') : null;

  return (
    <div className="card fade-in" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '18px 22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{title}</h3>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            ML: {mlStats?.bestModel || 'Loading...'} (R�={mlStats?.r2?.toFixed(4) || '�'}) + Holt-Winters Forecast
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {mlStats && (
            <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: '#f0fdf4', color: '#059669' }}>
              R� {(mlStats.r2 * 100).toFixed(1)}%
            </span>
          )}
          {forecastTrend && (
            <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: forecastTrend === 'up' ? '#fef2f2' : '#eff6ff', color: forecastTrend === 'up' ? '#dc2626' : '#2563eb' }}>
              {forecastTrend === 'up' ? '? Rising' : '? Falling'} {forecastMean.toFixed(2)}{unit}
            </span>
          )}
        </div>
      </div>

      {mlStats && (
        <div style={{ display: 'flex', gap: 0, padding: '14px 22px', borderBottom: '1px solid #f1f5f9' }}>
          {[
            { label: 'Best Model', value: mlStats.bestModel, accent: '#2563eb' },
            { label: 'R� Score', value: (mlStats.r2 * 100).toFixed(1) + '%', accent: mlStats.r2 > 0.9 ? '#059669' : '#d97706' },
            { label: 'MAE', value: mlStats.mae?.toFixed(4), accent: '#1e293b' },
            { label: 'RMSE', value: mlStats.rmse?.toFixed(4), accent: '#1e293b' },
            { label: 'Train Samples', value: mlStats.nSamples, accent: '#1e293b' },
            { label: 'Features', value: mlStats.nFeatures, accent: '#14b8a6' },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', borderRight: i < 5 ? '1px solid #f1f5f9' : 'none' }}>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: s.accent }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {modelCompare.length > 0 && (
        <div style={{ padding: '10px 22px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>ML Model R� Comparison (scikit-learn trained)</div>
          <div style={{ height: 60 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={modelCompare} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} width={130} />
                <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Bar dataKey="r2" name="R² %" radius={[0, 4, 4, 0]} barSize={10} isAnimationActive={false}>
                  {modelCompare.map((entry, i) => (
                    <Cell key={i} fill={entry.r2 > 90 ? '#10b981' : entry.r2 > 50 ? '#38bdf8' : '#f59e0b'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div style={{ height: 220, padding: '8px 6px 0' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id={`fg-${sensorId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`ff-${sensorId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#14b8a6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 6" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="Timestamp" tickFormatter={formatTimestamp} stroke="transparent" tick={{ fontSize: 10, fill: '#94a3b8' }} interval="preserveStartEnd" />
            <YAxis stroke="transparent" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload;
              return (
                <div style={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 12, padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', fontSize: 12 }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>{d?.Timestamp}</div>
                  {d?.actual !== undefined && <div><span style={{ color: '#64748b' }}>Actual: </span><b style={{ color }}>{d.actual.toFixed(3)}{unit}</b></div>}
                  {d?.forecast !== undefined && <div><span style={{ color: '#64748b' }}>Holt-Winters Forecast: </span><b style={{ color: '#14b8a6' }}>{d.forecast}{unit}</b></div>}
                </div>
              );
            }} />
            <Area type="monotone" dataKey="actual" stroke={color} strokeWidth={2} fill={`url(#fg-${sensorId})`} dot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="forecast" stroke="#14b8a6" strokeWidth={2} strokeDasharray="6 4" fill={`url(#ff-${sensorId})`} dot={false} isAnimationActive={false} />
            {splitIndex > 0 && chartData[splitIndex - 1] && (
              <ReferenceDot x={chartData[splitIndex - 1].Timestamp} y={chartData[splitIndex - 1].actual} r={5} fill="white" stroke="#14b8a6" strokeWidth={2.5} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 20, padding: '10px 0 14px', fontSize: 11, color: '#94a3b8' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 16, height: 2, borderRadius: 2, background: color }} /> Actual</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 16, height: 2, borderTop: '2px dashed #14b8a6' }} /> Holt-Winters Forecast (ML)</span>
      </div>
    </div>
  );
}