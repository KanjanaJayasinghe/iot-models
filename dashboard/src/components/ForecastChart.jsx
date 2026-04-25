/* eslint-disable react/prop-types */

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar
} from 'recharts';
import { formatTimestamp } from '../utils/formatters';

export default function ForecastChart({ forecast }) {
  if (!forecast?.chartData?.length) {
    return <div className="card" style={{ padding: 32, textAlign: 'center' }}><p style={{ color: '#94a3b8' }}>No data for forecasting</p></div>;
  }

  return (
    <div className="card fade-in" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 18px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1e293b' }}>{forecast.title}</h3>
          <p style={{ fontSize: 11, color: '#64748b', marginTop: 3, maxWidth: 700 }}>
            {`Short-term outlook for ${forecast.topic}. Showing the most recent ${forecast.historicalCount} readings and the forecast pattern across the ${forecast.forecastWindowLabel}.`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: forecast.status.tone.background, color: forecast.status.tone.color, border: `1px solid ${forecast.status.tone.border}` }}>
            {forecast.status.label}
          </span>
          <span style={{ padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: forecast.confidence.tone.background, color: forecast.confidence.tone.color, border: `1px solid ${forecast.confidence.tone.border}` }}>
            {forecast.confidence.label}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, padding: '12px 18px' }}>
        {forecast.summaryCards.map(card => (
          <div key={card.key} style={{ padding: '13px 14px', borderRadius: 14, border: '1px solid #e2e8f0', background: '#fff' }}>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{card.label}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: card.accent, marginTop: 6, lineHeight: 1.18 }}>{card.value}</div>
            <p style={{ fontSize: 11, color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>{card.note}</p>
          </div>
        ))}
      </div>

      <div style={{ margin: '0 18px 14px', padding: 14, borderRadius: 16, border: '1px solid #e2e8f0', background: 'linear-gradient(135deg, #f8fbff, #ffffff)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div>
          <div style={{ fontSize: 10, color: '#2563eb', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>What the forecast suggests</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginTop: 8, lineHeight: 1.3 }}>{forecast.summary}</div>
          <p style={{ fontSize: 12, color: '#475569', marginTop: 8, lineHeight: 1.55 }}>{forecast.fieldNote}</p>
        </div>
        <div style={{ padding: 14, borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Quick reading guide</div>
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>Recent average</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginTop: 3 }}>{forecast.recentMean.toFixed(2)}{forecast.unitLabel ? ` ${forecast.unitLabel}` : ''}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>Expected next average</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0f766e', marginTop: 3 }}>{forecast.summaryCards[1]?.value}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>Expected band</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#334155', marginTop: 3 }}>{forecast.summaryCards[2]?.value}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ height: 250, padding: '0 8px 0 6px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={forecast.chartData} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id={`fg-${forecast.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={forecast.color} stopOpacity={0.2} />
                <stop offset="100%" stopColor={forecast.color} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`ff-${forecast.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#14b8a6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 6" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="Timestamp" tickFormatter={formatTimestamp} stroke="transparent" tick={{ fontSize: 10, fill: '#94a3b8' }} interval="preserveStartEnd" />
            <YAxis stroke="transparent" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload;
              const actualPoint = payload.find(item => item.dataKey === 'actual');
              const forecastPoint = payload.find(item => item.dataKey === 'forecast');
              return (
                <div style={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 12, padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', fontSize: 12 }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>{point?.Timestamp}</div>
                  {actualPoint && <div><span style={{ color: '#64748b' }}>Observed: </span><b style={{ color: forecast.color }}>{Number(actualPoint.value).toFixed(3)}{forecast.unitLabel ? ` ${forecast.unitLabel}` : ''}</b></div>}
                  {forecastPoint && <div><span style={{ color: '#64748b' }}>Projected: </span><b style={{ color: '#14b8a6' }}>{Number(forecastPoint.value).toFixed(3)}{forecast.unitLabel ? ` ${forecast.unitLabel}` : ''}</b></div>}
                </div>
              );
            }} />
            {forecast.boundaryTimestamp && (
              <ReferenceLine x={forecast.boundaryTimestamp} stroke="#14b8a6" strokeDasharray="4 4" />
            )}
            <Area type="monotone" dataKey="actual" stroke={forecast.color} strokeWidth={2} fill={`url(#fg-${forecast.key})`} dot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="forecast" stroke="#14b8a6" strokeWidth={2} strokeDasharray="6 4" fill={`url(#ff-${forecast.key})`} dot={false} isAnimationActive={false} connectNulls isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, padding: '8px 0 0', fontSize: 10, color: '#94a3b8', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 16, height: 2, borderRadius: 2, background: forecast.color }} /> Observed readings</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 16, height: 2, borderTop: '2px dashed #14b8a6' }} /> Projected readings</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 16, height: 0, borderTop: '2px dashed #14b8a6' }} /> Dotted line marks where the forecast begins</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, padding: '14px 18px 18px' }}>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 14, background: '#fff' }}>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
            Recent vs projected pattern
          </div>
          <div style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={forecast.comparisonBars} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 6" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={value => `${Number(value).toFixed(3)}${forecast.unitLabel ? ` ${forecast.unitLabel}` : ''}`} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} isAnimationActive={false} fill={forecast.color} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 14, background: '#fff' }}>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
            Forecast checkpoints
          </div>
          <div style={{ overflow: 'hidden', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, color: '#64748b', fontWeight: 700 }}>Forecast time</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, color: '#64748b', fontWeight: 700 }}>Expected value</th>
                  <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10, color: '#64748b', fontWeight: 700 }}>Compared with recent band</th>
                </tr>
              </thead>
              <tbody>
                {forecast.checkpoints.map(checkpoint => (
                  <tr key={checkpoint.key} style={{ borderTop: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '9px 10px', fontSize: 11, color: '#0f172a', fontWeight: 700 }}>{checkpoint.stepLabel}</td>
                    <td style={{ padding: '9px 10px', fontSize: 11, color: '#0f172a' }}>{checkpoint.valueText}</td>
                    <td style={{ padding: '9px 10px', fontSize: 11, color: '#475569' }}>{checkpoint.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}