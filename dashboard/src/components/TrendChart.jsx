import { memo, useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';
import { formatTimestamp } from '../utils/formatters';
import { movingAverage, linearRegression, exponentialSmoothing } from '../utils/analysis';
import { SENSORS, getValueKey } from '../config/sensors';

function TrendChart({ sensorData, valueKeys, mergedData }) {
  const [filter, setFilter] = useState('all');
  const [activeSensors, setActiveSensors] = useState(() =>
    new Set([SENSORS[0].id])
  );

  const toggleSensor = (id) => {
    setActiveSensors(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const chartData = useMemo(() => {
    if (!mergedData?.length) return [];
    let src = mergedData;

    // Date-relative filters — work correctly regardless of how many records are loaded
    const now = Date.now();
    if (filter === '24h') {
      src = src.filter(d => d.ts && (now - d.ts) <= 24 * 60 * 60 * 1000);
    } else if (filter === '7d') {
      src = src.filter(d => d.ts && (now - d.ts) <= 7 * 24 * 60 * 60 * 1000);
    } else if (filter === '30d') {
      src = src.filter(d => d.ts && (now - d.ts) <= 30 * 24 * 60 * 60 * 1000);
    }
    // filter === 'all' → use everything loaded (may be 500 live records or full date-range batch)

    // Down-sample to max 60 points for chart performance
    if (src.length > 60) {
      const step = Math.ceil(src.length / 60);
      src = src.filter((_, i) => i % step === 0);
    }

    let result = src.map((d, i) => ({ ...d, index: i }));

    // Only compute ML overlays for active sensors
    SENSORS.forEach(sensor => {
      if (!activeSensors.has(sensor.id)) return;
      const key = sensor.id;

      // Moving average
      result = movingAverage(result, key, 5);

      // Linear regression prediction
      const reg = linearRegression(result, 'index', key);
      const smooth = exponentialSmoothing(result, key, 0.3);

      result = result.map((d, i) => ({
        ...d,
        [`${key}_pred`]: parseFloat(reg.predict(d.index).toFixed(3)),
        [`${key}_ml`]: smooth[i]?.[`${key}_ES`] != null
          ? parseFloat(Number(smooth[i][`${key}_ES`]).toFixed(3))
          : (Number(d[key]) || 0),
      }));
    });

    return result;
  }, [mergedData, filter, activeSensors]);

  if (!chartData.length) {
    return (
      <div className="card fade-in" style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ color: '#94a3b8' }}>No trend data available yet.</p>
      </div>
    );
  }

  const active = SENSORS.filter(s => activeSensors.has(s.id));

  return (
    <div className="chart-container fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h3 className="chart-title">Trend Analysis</h3>
          <p className="chart-subtitle">Real-time sensor readings with regression &amp; smoothing</p>
        </div>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            padding: '8px 14px', borderRadius: 10,
            border: '1.5px solid var(--border-strong)',
            fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
            background: 'var(--bg-surface)', cursor: 'pointer', outline: 'none',
            fontFamily: 'var(--font-main)',
          }}
        >
          <option value="all">All Loaded Data</option>
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
        </select>
      </div>

      {/* Sensor Toggles */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {SENSORS.map(s => (
          <button
            key={s.id}
            onClick={() => toggleSensor(s.id)}
            style={{
              padding: '6px 16px',
              borderRadius: 50,
              fontSize: 12,
              fontWeight: 700,
              border: `1.5px solid ${s.color}`,
              background: activeSensors.has(s.id) ? s.color : 'transparent',
              color: activeSensors.has(s.id) ? 'white' : s.color,
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: activeSensors.has(s.id) ? `0 4px 12px ${s.color}44` : 'none',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        {active.map(s => (
          <LegendDot key={s.id} color={s.color} label={`${s.label} Data`} />
        ))}
        <LegendDot color="#14b8a6" label="Predictions" />
        <LegendDot color="#8b5cf6" label="ML Smoothing" />
      </div>

      {/* Chart */}
      <div style={{ height: 380 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <defs>
              {active.map(s => (
                <linearGradient key={s.id} id={`grad-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 6" stroke="#f0f2f5" vertical={false} />
            <XAxis
              dataKey="Timestamp"
              tickFormatter={v => formatTimestamp(v)}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: 'white', border: '1px solid #e2e8f0', borderRadius: 14,
                boxShadow: '0 8px 24px rgba(0,0,0,0.1)', padding: '12px 16px',
              }}
              labelFormatter={v => formatTimestamp(v)}
              formatter={(value, name) => [Number(value).toFixed(2), name]}
            />

            {/* Actual data lines */}
            {active.map(s => (
              <Area
                key={s.id}
                type="monotone"
                dataKey={s.id}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                fill={`url(#grad-${s.id})`}
                dot={false}
                activeDot={{ r: 4, fill: 'white', stroke: s.color, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}

            {/* Prediction lines (dashed) */}
            {active.map(s => (
              <Area
                key={`${s.id}_pred`}
                type="monotone"
                dataKey={`${s.id}_pred`}
                name={`${s.label} Predict`}
                stroke="#14b8a6"
                strokeWidth={1.5}
                strokeDasharray="6 4"
                fill="none"
                dot={false}
                isAnimationActive={false}
              />
            ))}

            {/* ML smoothing lines */}
            {active.map(s => (
              <Area
                key={`${s.id}_ml`}
                type="monotone"
                dataKey={`${s.id}_ml`}
                name={`${s.label} ML`}
                stroke="#8b5cf6"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fill="none"
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom legend */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 16 }}>
        <LegendDot color="#3b82f6" label="Time Series Data" filled />
        <LegendDot color="#14b8a6" label="Linear Regression" filled />
        <LegendDot color="#8b5cf6" label="Exponential Smoothing" filled />
      </div>
    </div>
  );
}

export default memo(TrendChart);

function LegendDot({ color, label, filled }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        background: filled ? color : 'transparent',
        border: `2px solid ${color}`,
      }} />
      <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{label}</span>
    </div>
  );
}
