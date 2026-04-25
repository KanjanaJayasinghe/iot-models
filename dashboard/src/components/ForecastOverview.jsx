export default function ForecastOverview({ forecasts }) {
  if (!forecasts?.length) return null;

  const watchList = forecasts
    .filter(forecast => forecast.status.key !== 'stable')
    .sort((left, right) => right.priorityScore - left.priorityScore);
  const stableCount = forecasts.length - watchList.length;
  const higherConfidenceCount = forecasts.filter(forecast => forecast.confidence.rank === 3).length;
  const forecastWindowHours = Math.max(...forecasts.map(forecast => Math.round(forecast.forecastHorizonHours || 0)), 0);
  const watchNames = watchList.slice(0, 3).map(forecast => forecast.sensor.label).join(', ');
  const headline = watchList.length
    ? `Short-term changes are most noticeable in ${watchNames}.`
    : 'Most site readings look steady in the short-term outlook.';
  const summary = watchList.length
    ? 'Use the forecast cards below to see what is shifting, how large the expected change is, and what it may mean for field checks.'
    : 'The current forecast suggests broadly stable water-quality conditions across the monitored site.';

  const cards = [
    {
      key: 'stable',
      label: 'Stable sensors',
      value: stableCount,
      note: `${stableCount === 1 ? 'Sensor remains' : 'Sensors remain'} close to the recent pattern`,
      accent: '#047857',
      background: '#ecfdf5',
    },
    {
      key: 'watch',
      label: 'Sensors to watch',
      value: watchList.length,
      note: watchList.length ? watchNames : 'No short-term shifts stand out',
      accent: '#c2410c',
      background: '#fff7ed',
    },
    {
      key: 'confidence',
      label: 'Higher-confidence outlooks',
      value: higherConfidenceCount,
      note: 'Forecasts with stronger validation signals',
      accent: '#1d4ed8',
      background: '#eff6ff',
    },
    {
      key: 'window',
        label: 'Forecast window',
        value: `${forecastWindowHours}h`,
        note: 'Time-based forecast horizon used for each sensor',
      accent: '#0f766e',
      background: '#f0fdfa',
    },
  ];

  return (
    <div className="card fade-in" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>Coastal Outlook</h3>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 3, maxWidth: 700 }}>
            Plain-language forecast summary for field teams and coastal department staff.
          </p>
        </div>
        <div style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: 11, fontWeight: 700 }}>
          Next {forecastWindowHours} hours outlook
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginTop: 14 }}>
        <div style={{ padding: 16, borderRadius: 16, border: '1px solid #dbeafe', background: 'linear-gradient(135deg, #eff6ff, #f8fafc)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#2563eb', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Overall site reading</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 8, lineHeight: 1.22 }}>{headline}</div>
          <p style={{ fontSize: 12, color: '#475569', marginTop: 7, lineHeight: 1.55 }}>{summary}</p>
        </div>

        {cards.slice(0, 3).map(card => (
          <div key={card.key} style={{ padding: 16, borderRadius: 16, border: '1px solid #e2e8f0', background: card.background }}>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{card.label}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: card.accent, marginTop: 8 }}>{card.value}</div>
            <p style={{ fontSize: 11, color: '#475569', marginTop: 7, lineHeight: 1.45 }}>{card.note}</p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 12, color: '#475569', lineHeight: 1.55 }}>
        Forecast cards below are designed for non-technical review. Model fit scores and validation errors are grouped in a separate technical section at the bottom of the page.
      </div>
    </div>
  );
}