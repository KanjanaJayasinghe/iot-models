import { useMemo } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { Thermometer, Droplets, Waves, Sun, Move3d, Activity } from 'lucide-react';

const ICONS = {
  turbidity: Waves,
  ph: Droplets,
  temperature: Thermometer,
  tds: Activity,
  light: Sun,
  axis: Move3d,
};

const ICON_BG = {
  turbidity: '#c4b5fd',
  ph: '#5eead4',
  temperature: '#6ee7b7',
  tds: '#7dd3fc',
  light: '#67e8f9',
  axis: '#93c5fd',
};

export default function SensorCard({ title, value, unit, data, dataKey, variant, color }) {
  const sparkData = useMemo(() => {
    if (!data?.length) return [];
    return data.slice(-20).map(d => ({ v: Number(d[dataKey]) || 0 }));
  }, [data, dataKey]);

  const Icon = ICONS[variant] || Activity;
  const iconBg = ICON_BG[variant] || '#93c5fd';

  return (
    <div className={`sensor-card ${variant} fade-in`}>
      {/* Top: icon + title + dots */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: iconBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon style={{ width: 15, height: 15, color: '#fff' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{title}</span>
        </div>
        <span style={{ fontSize: 14, color: '#94a3b8', cursor: 'pointer', letterSpacing: 2 }}>•••</span>
      </div>

      {/* Value */}
      <div style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1 }}>
          {typeof value === 'number' ? value.toFixed(1) : value}
        </span>
        <span style={{ fontSize: 12, fontWeight: 500, marginLeft: 3, opacity: 0.7 }}>{unit}</span>
      </div>

      {/* Sparkline */}
      {sparkData.length > 2 && (
        <div style={{ height: 30, marginLeft: -16, marginRight: -16, marginBottom: -14 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData}>
              <defs>
                <linearGradient id={`spark-${variant}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color || '#60a5fa'} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={color || '#60a5fa'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={color || '#60a5fa'} strokeWidth={1.5} fill={`url(#spark-${variant})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
