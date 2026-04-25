import { memo, useMemo, useEffect, useState } from 'react';
import { CheckCircle, AlertTriangle, AlertOctagon } from 'lucide-react';
import { loadThresholdResults } from '../utils/mlResults';
import { SENSORS, getValueKey } from '../config/sensors';
import { buildHistoricalAlertModel } from '../utils/analysis';

function AlertSidebar({ sensorData, valueKeys }) {
  const [mlData, setMlData] = useState(null);

  useEffect(() => {
    loadThresholdResults().then(setMlData);
  }, []);

  const alerts = useMemo(() => {
    const items = [];

    SENSORS.forEach(sensor => {
      const data = sensorData[sensor.id];
      const vKey = getValueKey(sensor.id, valueKeys);
      if (!data?.length || !vKey) return;

      const sensorML = mlData?.[sensor.id];
      const model = buildHistoricalAlertModel({
        sensor,
        data,
        dataKey: vKey,
        thresholdResult: sensorML,
      });

      if (!model) {
        const latest = Number(data[data.length - 1]?.[vKey]) || 0;
        items.push({
          type: 'safe',
          title: 'Safe',
          message: `${sensor.label} last: ${latest.toFixed(2)}`,
          detail: 'ML thresholds loading...',
        });
        return;
      }

      const recentDanger = model.recentCounts.dangerLow + model.recentCounts.dangerHigh;
      const recentWarning = model.recentCounts.warningLow + model.recentCounts.warningHigh;

      if (recentDanger > 0) {
        items.push({
          type: 'danger',
          title: 'Danger',
          message: `${recentDanger} recent ${sensor.label} readings are in an unusual historical range.`,
          detail: `Usual band: ${model.bands.normalLow.toFixed(2)} to ${model.bands.normalHigh.toFixed(2)} ${sensor.unit}`,
        });
      } else if (recentWarning > 0) {
        items.push({
          type: 'warning',
          title: 'Warning',
          message: `${recentWarning} recent ${sensor.label} readings are outside the usual historical band.`,
          detail: `Usual band: ${model.bands.normalLow.toFixed(2)} to ${model.bands.normalHigh.toFixed(2)} ${sensor.unit}`,
        });
      } else {
        items.push({
          type: 'safe',
          title: 'Safe',
          message: `${sensor.label} readings remain inside the usual historical band.`,
          detail: `Usual band: ${model.bands.normalLow.toFixed(2)} to ${model.bands.normalHigh.toFixed(2)} ${sensor.unit}`,
        });
      }
    });

    if (items.length === 0) {
      items.push({
        type: 'safe',
        title: 'Safe',
        message: 'All sensor readings are normal.',
        detail: 'ML system operating normally.',
      });
    }
    return items;
  }, [sensorData, valueKeys, mlData]);

  const iconMap = {
    safe:    <CheckCircle   style={{ width: 16, height: 16, color: '#10b981' }} />,
    warning: <AlertTriangle style={{ width: 16, height: 16, color: '#f59e0b' }} />,
    danger:  <AlertOctagon  style={{ width: 16, height: 16, color: '#ef4444' }} />,
  };

  const bgMap     = { safe: 'alert-safe', warning: 'alert-warning', danger: 'alert-danger' };
  const iconBgMap = {
    safe:    { background: '#dcfce7', borderRadius: 7, padding: 5, display: 'flex', flexShrink: 0 },
    warning: { background: '#fef9c3', borderRadius: 7, padding: 5, display: 'flex', flexShrink: 0 },
    danger:  { background: '#ffe4e6', borderRadius: 7, padding: 5, display: 'flex', flexShrink: 0 },
  };
  const titleColorMap = { safe: '#059669', warning: '#d97706', danger: '#dc2626' };

  const activeType = alerts.some(a => a.type === 'danger') ? 'danger' : alerts.some(a => a.type === 'warning') ? 'warning' : 'safe';
  const badgeBg    = { danger: '#ffe4e6', warning: '#fef9c3', safe: '#dcfce7' }[activeType];
  const badgeColor = { danger: '#dc2626', warning: '#a16207', safe: '#15803d' }[activeType];
  const activeCount = alerts.filter(a => a.type !== 'safe').length;

  return (
    <div className="card" style={{ padding: '16px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h3 className="section-title" style={{ marginBottom: 0, fontSize: 14 }}>Sensor Alerts</h3>
        <span style={{ padding: '3px 10px', borderRadius: 50, fontSize: 11, fontWeight: 800, background: badgeBg, color: badgeColor }}>
          {activeCount === 0 ? 'All Clear' : `${activeCount} Active`}
        </span>
      </div>
      <div style={{ maxHeight: 420, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {alerts.map((alert, i) => (
          <div key={`${alert.type}-${i}`} className={`alert-item ${bgMap[alert.type]} fade-in`} style={{ animationDelay: `${i * 0.07}s` }}>
            <div style={iconBgMap[alert.type]}>
              {iconMap[alert.type]}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: titleColorMap[alert.type], letterSpacing: '-0.1px' }}>{alert.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>{alert.message}</div>
              <div style={{ fontSize: 11, color: titleColorMap[alert.type], fontWeight: 600, marginTop: 3, opacity: 0.8 }}>{alert.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(AlertSidebar);