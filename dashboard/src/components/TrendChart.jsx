import { memo, useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';
import { Calendar, RefreshCw } from 'lucide-react';
import { formatTimestamp } from '../utils/formatters';
import { SENSORS } from '../config/sensors';

function toInputDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function TrendChart({ sensorData, valueKeys, mergedData, dateRange, onDateRangeChange }) {
  const [activeSensors, setActiveSensors] = useState(() => new Set([SENSORS[0].id]));

  // Local date inputs — initialise from any active dateRange
  const [startVal, setStartVal] = useState(dateRange ? toInputDate(dateRange.start) : '');
  const [endVal,   setEndVal]   = useState(dateRange ? toInputDate(dateRange.end)   : '');

  const toggleSensor = (id) => {
    setActiveSensors(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  function applyRange() {
    if (!startVal || !endVal) return;
    const start = new Date(startVal); start.setHours(0, 0, 0, 0);
    const end   = new Date(endVal);   end.setHours(23, 59, 59, 999);
    if (start > end) return;
    if (onDateRangeChange) onDateRangeChange({ start, end });
  }

  function clearRange() {
    setStartVal('');
    setEndVal('');
    if (onDateRangeChange) onDateRangeChange(null);
  }

  // Down-sample to max 300 points for performance, keeping shape
  const chartData = useMemo(() => {
    if (!mergedData?.length) return [];
    let src = mergedData;
    if (src.length > 300) {
      const step = Math.ceil(src.length / 300);
      src = src.filter((_, i) => i % step === 0);
    }
    return src;
  }, [mergedData]);

  const active = SENSORS.filter(s => activeSensors.has(s.id));
  const totalRecords = mergedData?.length ?? 0;

  if (!chartData.length) {
    return (
      <div className="card fade-in" style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ color: '#94a3b8' }}>No data available. Select a date range to load historical records.</p>
      </div>
    );
  }

  return (
    <div className="chart-container fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 className="chart-title">Historical Sensor Data</h3>
          <p className="chart-subtitle">
            {dateRange
              ? `${toInputDate(dateRange.start)} → ${toInputDate(dateRange.end)} · ${totalRecords.toLocaleString()} records loaded`
              : `Live view · ${totalRecords.toLocaleString()} records loaded`}
          </p>
        </div>

        {/* Inline date range picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Calendar size={14} style={{ color: '#64748b', flexShrink: 0 }} />
          <input
            type="date"
            value={startVal}
            onChange={e => setStartVal(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 12, outline: 'none', fontFamily: 'var(--font-main)' }}
          />
          <span style={{ color: '#94a3b8', fontSize: 12 }}>to</span>
          <input
            type="date"
            value={endVal}
            onChange={e => setEndVal(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 12, outline: 'none', fontFamily: 'var(--font-main)' }}
          />
          <button
            onClick={applyRange}
            disabled={!startVal || !endVal}
            style={{
              padding: '7px 16px', borderRadius: 9, border: 'none',
              background: (!startVal || !endVal) ? '#e2e8f0' : 'linear-gradient(135deg,#2563eb,#0891b2)',
              color: (!startVal || !endVal) ? '#94a3b8' : 'white',
              fontWeight: 700, fontSize: 12, cursor: (!startVal || !endVal) ? 'default' : 'pointer',
              fontFamily: 'var(--font-main)',
            }}
          >
            Load
          </button>
          {dateRange && (
            <button
              onClick={clearRange}
              title="Back to live view"
              style={{ padding: '7px 10px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'white', color: '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <RefreshCw size={12} /> Live
            </button>
          )}
        </div>
      </div>

      {/* Sensor Toggles */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {SENSORS.map(s => (
          <button
            key={s.id}
            onClick={() => toggleSensor(s.id)}
            style={{
              padding: '6px 16px', borderRadius: 50, fontSize: 12, fontWeight: 700,
              border: `1.5px solid ${s.color}`,
              background: activeSensors.has(s.id) ? s.color : 'transparent',
              color: activeSensors.has(s.id) ? 'white' : s.color,
              cursor: 'pointer', transition: 'all 0.2s',
              boxShadow: activeSensors.has(s.id) ? `0 4px 12px ${s.color}44` : 'none',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div style={{ height: 380 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <defs>
              {active.map(s => (
                <linearGradient key={s.id} id={`grad-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
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
            {/* Raw sensor data lines only */}
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
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 14, flexWrap: 'wrap' }}>
        {active.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color }} />
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(TrendChart);

