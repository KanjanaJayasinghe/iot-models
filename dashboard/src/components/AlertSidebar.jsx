import { useMemo, useEffect, useState } from 'react';
import { CheckCircle, AlertTriangle, AlertOctagon, Info } from 'lucide-react';
import { loadThresholdResults } from '../utils/mlResults';
import { SENSORS, getValueKey } from '../config/sensors';

export default function AlertSidebar({ sensorData, valueKeys }) {
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
      const gmm = sensorML?.gmm_thresholds;

      if (!gmm) {
        // ML not loaded yet � use basic check
        const latest = Number(data[data.length - 1]?.[vKey]) || 0;
        items.push({
          type: 'safe',
          title: 'Safe',
          message: `${sensor.label} last: ${latest.toFixed(2)}`,
          detail: 'ML thresholds loading...',
        });
        return;
      }

      // Use GMM-learned thresholds from ML
      const warningLow = gmm.thresholds.warning_low;
      const warningHigh = gmm.thresholds.warning_high;
      const zoneCounts = gmm.zone_counts || {};

      const dangers = zoneCounts.danger || 0;
      const warnings = zoneCounts.warning || 0;
      const normals = zoneCounts.normal || 0;

      // Check latest readings against ML thresholds
      const recentData = data.slice(-20);
      let recentDanger = 0, recentWarning = 0;
      recentData.forEach(d => {
        const val = Number(d[vKey]) || 0;
        if (val < warningLow * 0.8 || val > warningHigh * 1.2) recentDanger++;
        else if (val < warningLow || val > warningHigh) recentWarning++;
      });

      if (recentDanger > 0) {
        items.push({
          type: 'danger',
          title: 'Danger',
          message: `${recentDanger} recent ${sensor.label} readings exceed GMM danger threshold.`,
          detail: `Range: [${warningLow.toFixed(1)}, ${warningHigh.toFixed(1)}]`,
        });
      } else if (recentWarning > 0) {
        items.push({
          type: 'warning',
          title: 'Warning',
          message: `${recentWarning} recent ${sensor.label} readings outside GMM warning zone.`,
          detail: `Range: [${warningLow.toFixed(1)}, ${warningHigh.toFixed(1)}]`,
        });
      } else {
        items.push({
          type: 'safe',
          title: 'Safe',
          message: `${sensor.label} readings within ML threshold range.`,
          detail: `GMM zone: [${warningLow.toFixed(1)}, ${warningHigh.toFixed(1)}]`,
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
    safe:    <CheckCircle   style={{ width: 22, height: 22, color: '#10b981' }} />,
    warning: <AlertTriangle style={{ width: 22, height: 22, color: '#f59e0b' }} />,
    danger:  <AlertOctagon  style={{ width: 22, height: 22, color: '#ef4444' }} />,
  };

  const bgMap     = { safe: 'alert-safe', warning: 'alert-warning', danger: 'alert-danger' };
  const iconBgMap = {
    safe:    { background: '#d1fae5', borderRadius: 12, padding: 8, display: 'flex' },
    warning: { background: '#fef3c7', borderRadius: 12, padding: 8, display: 'flex' },
    danger:  { background: '#ffe4e6', borderRadius: 12, padding: 8, display: 'flex' },
  };
  const titleColorMap = { safe: '#059669', warning: '#d97706', danger: '#dc2626' };

  return (
    <div className="card" style={{ padding: '20px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>ML Alert Panel</h3>
        <span style={{ fontSize: 10, color: '#94a3b8' }}>GMM Threshold</span>
      </div>
      <div style={{ maxHeight: 420, overflow: 'auto' }}>
        {alerts.map((alert, i) => (
          <div key={i} className={`alert-item ${bgMap[alert.type]} fade-in`} style={{ animationDelay: `${i * 0.08}s` }}>
            <div style={iconBgMap[alert.type]}>
              {iconMap[alert.type]}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: titleColorMap[alert.type] }}>{alert.title}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                {alert.message}
                <br />
                <span style={{ color: titleColorMap[alert.type], fontWeight: 500 }}>{alert.detail}</span>
              </div>
            </div>
            <Info style={{ width: 16, height: 16, color: '#cbd5e1' }} />
          </div>
        ))}
      </div>
    </div>
  );
}