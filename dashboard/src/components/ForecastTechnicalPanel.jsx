import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';

function formatHorizonText(hours) {
  if (!Number.isFinite(hours) || hours <= 0) return '--';
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

function formatMetric(value, digits = 3) {
  if (!Number.isFinite(value)) return '--';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export default function ForecastTechnicalPanel({ forecasts }) {
  if (!forecasts?.length) return null;

  return (
    <div className="card fade-in" style={{ padding: 18 }}>
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>Model Performance Details</h3>
        <p style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
          Technical review section for validation metrics, forecast method details, and regression model comparison.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
        {forecasts.map(forecast => {
          const metrics = [
            { key: 'forecast-method', label: 'Forecast method', value: forecast.technical.forecastMethod },
            { key: 'trend-type', label: 'Trend setting', value: forecast.technical.trendType },
            { key: 'best-model', label: 'Best regression model', value: forecast.technical.bestRegressionModel },
            { key: 'fit-score', label: 'Regression fit (R2)', value: Number.isFinite(forecast.technical.fitScore) ? `${(forecast.technical.fitScore * 100).toFixed(1)}%` : '--' },
            { key: 'forecast-mae', label: 'Forecast MAE', value: formatMetric(forecast.technical.forecastMae) },
            { key: 'forecast-rmse', label: 'Forecast RMSE', value: formatMetric(forecast.technical.forecastRmse) },
            { key: 'samples', label: 'Training samples', value: forecast.technical.nSamples ?? '--' },
            { key: 'validation', label: 'Validation points', value: forecast.technical.validationPoints ?? '--' },
          ];

          return (
            <div key={forecast.key} style={{ border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', background: '#fff' }}>
              <div style={{ padding: '13px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <h4 style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{forecast.sensor.label}</h4>
                  <p style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Forecast horizon: {formatHorizonText(Math.round(forecast.technical.forecastHorizonHours || 0))} ahead
                  </p>
                </div>
                <div style={{ padding: '6px 10px', borderRadius: 999, background: '#f8fafc', border: '1px solid #cbd5e1', color: '#334155', fontSize: 11, fontWeight: 700 }}>
                  Features used: {forecast.technical.nFeatures ?? '--'}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 0, borderBottom: '1px solid #f1f5f9' }}>
                {metrics.map(metric => (
                  <div key={metric.key} style={{ padding: '11px 12px', borderRight: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{metric.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginTop: 5 }}>{metric.value}</div>
                  </div>
                ))}
              </div>

              {forecast.technical.modelCompare?.length > 0 && (
                <div style={{ padding: 14 }}>
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                    Regression model comparison
                  </div>
                  <div style={{ height: 140 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={forecast.technical.modelCompare} layout="vertical" margin={{ top: 0, right: 12, left: 12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 6" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10, fill: '#475569' }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={value => `${Number(value).toFixed(1)}%`} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                        <Bar dataKey="fitScore" radius={[0, 6, 6, 0]} barSize={12} isAnimationActive={false}>
                          {forecast.technical.modelCompare.map(entry => (
                            <Cell key={entry.key} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}