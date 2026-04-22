import { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';
import CustomTooltip from './CustomTooltip';
import { formatTimestamp } from '../utils/formatters';
import { movingAverage, linearRegression } from '../utils/analysis';

export default function TimeSeriesChart({ data, dataKey, title, color = '#3b82f6', unit = '', showMA = true, showTrend = true }) {
  const processedData = useMemo(() => {
    if (!data?.length) return [];
    let result = data.map((d, i) => ({ ...d, index: i }));
    if (showMA) {
      result = movingAverage(result, dataKey, 5);
    }
    return result;
  }, [data, dataKey, showMA]);

  const regression = useMemo(() => {
    if (!showTrend || !processedData.length) return null;
    return linearRegression(processedData, 'index', dataKey);
  }, [processedData, dataKey, showTrend]);

  const trendData = useMemo(() => {
    if (!regression) return [];
    return processedData.map(d => ({
      ...d,
      trend: parseFloat(regression.predict(d.index).toFixed(3)),
    }));
  }, [processedData, regression]);

  const chartData = trendData.length ? trendData : processedData;

  if (!chartData.length) {
    return (
      <div className="glass-card p-6 flex items-center justify-center h-80">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          </div>
          <p className="text-slate-400 font-medium">No data available</p>
        </div>
      </div>
    );
  }

  const gradientId = `gradient-${dataKey}-${color.replace('#', '')}`;

  return (
    <div className="glass-card p-6 fade-in-up">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-bold text-slate-700">{title}</h3>
          {regression && (
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${regression.slope > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                {regression.slope > 0 ? '↑ Rising' : '↓ Falling'}
              </span>
              <span className="text-xs text-slate-400 font-medium">R² = {regression.rSquared.toFixed(3)}</span>
            </div>
          )}
        </div>
        <div className="flex gap-4 text-xs">
          {showMA && <Legend color={color} label="Moving Avg" dashed />}
          {showTrend && <Legend color="#14b8a6" label="Trend" dashed />}
        </div>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                <stop offset="50%" stopColor={color} stopOpacity={0.05} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.7} />
            <XAxis
              dataKey="Timestamp"
              tickFormatter={formatTimestamp}
              stroke="#cbd5e1"
              tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
              interval="preserveStartEnd"
              axisLine={{ stroke: '#e2e8f0' }}
            />
            <YAxis
              stroke="#cbd5e1"
              tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
              tickFormatter={v => `${v}${unit}`}
              axisLine={{ stroke: '#e2e8f0' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2.5}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 6, fill: 'white', stroke: color, strokeWidth: 3 }}
            />
            {showMA && (
              <Area
                type="monotone"
                dataKey={`${dataKey}_MA`}
                stroke={color}
                strokeWidth={1.5}
                strokeDasharray="6 4"
                strokeOpacity={0.4}
                fill="none"
                dot={false}
              />
            )}
            {showTrend && (
              <Area
                type="monotone"
                dataKey="trend"
                stroke="#14b8a6"
                strokeWidth={2}
                strokeDasharray="8 4"
                fill="none"
                dot={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Legend({ color, label, dashed }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-5 h-0" style={{ borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`, opacity: dashed ? 0.5 : 1 }} />
      <span className="text-slate-400 font-medium">{label}</span>
    </div>
  );
}
