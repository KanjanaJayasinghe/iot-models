import { memo, useMemo } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { Thermometer, Droplets, Waves, Sun, Move3d, Activity } from 'lucide-react';

const ICONS = {
  turbidity:   Waves,
  ph:          Droplets,
  temperature: Thermometer,
  tds:         Activity,
  light:       Sun,
  axis:        Move3d,
};

function SensorCard({ title, value, unit, data, dataKey, variant, color }) {
  const sparkData = useMemo(() => {
    if (!data?.length) return [];
    return data.slice(-24).map(d => ({ v: Number(d[dataKey]) || 0 }));
  }, [data, dataKey]);

  const Icon = ICONS[variant] || Activity;

  return (
    <div className={`sensor-card ${variant} fade-in`}>
      {/* Top row: icon + label */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'rgba(255,255,255,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(4px)',
          }}>
            <Icon style={{ width: 14, height: 14, color: '#fff' }} />
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.82, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{title}</span>
        </div>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'rgba(255,255,255,0.6)',
          boxShadow: '0 0 6px rgba(255,255,255,0.8)',
        }} />
      </div>

      {/* Value */}
      <div style={{ marginTop: 8, marginBottom: 2 }}>
        <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-1px', lineHeight: 1 }}>
          {typeof value === 'number' ? value.toFixed(1) : value}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 4, opacity: 0.65 }}>{unit}</span>
      </div>

      {/* Sparkline — bleeds to edges */}
      {sparkData.length > 2 && (
        <div style={{ height: 32, marginLeft: -16, marginRight: -16, marginTop: 4 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData}>
              <defs>
                <linearGradient id={`sg-${variant}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#ffffff" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke="rgba(255,255,255,0.75)"
                strokeWidth={2}
                fill={`url(#sg-${variant})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default memo(SensorCard);