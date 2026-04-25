import { useMemo, useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { loadCorrelationResults } from '../utils/mlResults';
import { SENSORS } from '../config/sensors';

export default function CorrelationPanel({ sensorData, mergedData }) {
  const [mlData, setMlData] = useState(null);

  useEffect(() => {
    loadCorrelationResults().then(setMlData);
  }, []);

  const available = SENSORS.filter(s => sensorData[s.id]?.length > 0);

  // Heatmap: NxN correlation matrix from ML Pearson results
  const { matrix, sensorList } = useMemo(() => {
    if (!mlData?.correlation_matrices?.pearson || available.length < 2) return { matrix: [], sensorList: [] };

    const pearson = mlData.correlation_matrices.pearson;
    const mat = [];
    for (const s1 of available) {
      for (const s2 of available) {
        const val = pearson?.[s1.id]?.[s2.id];
        const corr = (val == null || isNaN(val)) ? 0 : val;
        mat.push({ row: s1.id, rowLabel: s1.label, col: s2.id, colLabel: s2.label, value: corr });
      }
    }
    return { matrix: mat, sensorList: available };
  }, [mlData, available]);

  const getHeatColor = (v) => {
    const abs = Math.abs(v);
    if (abs > 0.7) return '#2563eb';
    if (abs > 0.4) return '#3b82f6';
    if (abs > 0.2) return '#93c5fd';
    return '#dbeafe';
  };

  return (
<div className="card" style={{ padding: '22px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h3 className="section-title" style={{ marginBottom: 2, fontSize: 14 }}>Correlation Matrix</h3>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 500 }}>Pearson correlation (ML computed)</p>
        </div>
      </div>

      {/* NxN Correlation Heatmap from ML */}
      {sensorList.length >= 2 && (
        <div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `auto repeat(${sensorList.length}, 1fr)`,
            gap: 3,
            fontSize: 10,
          }}>
            <div />
            {sensorList.map(s => (
              <div key={s.id} style={{ textAlign: 'center', fontWeight: 600, color: '#64748b', padding: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.label.slice(0, 5)}
              </div>
            ))}

            {sensorList.map(rowSensor => (
              <div key={`row-${rowSensor.id}`} style={{ display: 'contents' }}>
                <div style={{ fontWeight: 600, color: '#64748b', padding: '6px 4px', display: 'flex', alignItems: 'center', fontSize: 9 }}>
                  {rowSensor.label.slice(0, 5)}
                </div>
                {sensorList.map(colSensor => {
                  const cell = matrix.find(m => m.row === rowSensor.id && m.col === colSensor.id);
                  const val = cell?.value ?? 0;
                  return (
                    <div
                      key={`${rowSensor.id}-${colSensor.id}`}
                      style={{
                        background: getHeatColor(val),
                        color: Math.abs(val) > 0.4 ? 'white' : '#1e293b',
                        borderRadius: 6,
                        padding: '6px 2px',
                        textAlign: 'center',
                        fontWeight: 700,
                        fontSize: 10,
                      }}
                    >
                      {val.toFixed(2)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 9, color: '#94a3b8' }}>
            <span>Low</span>
            <div style={{ flex: 1, margin: '0 6px', height: 5, borderRadius: 3, background: 'linear-gradient(90deg, #dbeafe, #93c5fd, #3b82f6, #2563eb)' }} />
            <span>High</span>
          </div>
        </div>
      )}
    </div>
  );
}