import { useMemo, useEffect, useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, BarChart, PieChart, Pie, ReferenceArea, ReferenceLine
} from 'recharts';
import { loadAnomalyResults, loadThresholdResults } from '../utils/mlResults';
import { formatTimestamp } from '../utils/formatters';
import { buildHistoricalAlertModel } from '../utils/analysis';

export default function AnomalyChart({ data, dataKey, title, color = '#3b82f6', sensorId }) {
  const [mlData, setMlData] = useState(null);
  const [thresholdData, setThresholdData] = useState(null);

  useEffect(() => {
    loadAnomalyResults().then(setMlData);
    loadThresholdResults().then(setThresholdData);
  }, []);

  const { analyzed, anomalyCount, healthScore, distribution, mlInfo, modelCompare, thresholdCards, latestSummary, recentSummary, historicalMix, thresholdBand } = useMemo(() => {
    if (!data?.length) {
      return {
        analyzed: [], anomalyCount: 0, healthScore: 100, distribution: [], mlInfo: null, modelCompare: [],
        thresholdCards: [], latestSummary: null, recentSummary: [], historicalMix: [], thresholdBand: null,
      };
    }

    const sensorML = mlData?.[sensorId];
    const sensorThreshold = thresholdData?.[sensorId];
    const bestModel = sensorML?.best_model || 'Isolation_Forest';
    const bestModelData = sensorML?.models?.[bestModel];
    const model = buildHistoricalAlertModel({
      sensor: { id: sensorId, label: title.replace(' Anomaly Detection', ''), color, unit: '' },
      data,
      dataKey,
      thresholdResult: sensorThreshold,
      anomalyResult: sensorML,
    });
    if (!model) {
      return {
        analyzed: [], anomalyCount: 0, healthScore: 100, distribution: [], mlInfo: null, modelCompare: [],
        thresholdCards: [], latestSummary: null, recentSummary: [], historicalMix: [], thresholdBand: null,
      };
    }

    const allAnalyzed = model.enriched;

    // Downsample chart data to 120 points for performance (keep all alerts)
    let result = allAnalyzed;
    if (allAnalyzed.length > 120) {
      const step = Math.ceil(allAnalyzed.length / 120);
      const sampled = allAnalyzed.filter((_, i) => i % step === 0);
      const anomalies = allAnalyzed.filter(d => d.isAlert);
      const combined = [...sampled, ...anomalies];
      combined.sort((a, b) => (a.ts || 0) - (b.ts || 0));
      result = combined.filter((d, i, arr) => i === 0 || d.Timestamp !== arr[i-1].Timestamp);
    }

    const ac = allAnalyzed.filter(d => d.isAlert).length;
    const hs = model.healthScore;

    // Historical-threshold distribution buckets
    const buckets = [
      { range: 'Unusual low', count: 0, fill: '#ef4444' },
      { range: 'Low side', count: 0, fill: '#f59e0b' },
      { range: 'Usual', count: 0, fill: '#10b981' },
      { range: 'High side', count: 0, fill: '#f59e0b' },
      { range: 'Unusual high', count: 0, fill: '#ef4444' },
    ];
    result.forEach(d => {
      if (d.status.level === 'danger-low') buckets[0].count++;
      else if (d.status.level === 'warning-low') buckets[1].count++;
      else if (d.status.level === 'normal') buckets[2].count++;
      else if (d.status.level === 'warning-high') buckets[3].count++;
      else if (d.status.level === 'danger-high') buckets[4].count++;
    });

    const info = sensorML ? {
      bestModel: bestModel.replace(/_/g, ' '),
      nSamples: sensorML?.n_samples || data.length,
      historicalLow: model.bands.normalLow,
      historicalHigh: model.bands.normalHigh,
      bestF1: bestModelData?.metrics?.f1 || 0,
      bestPrecision: bestModelData?.metrics?.precision || 0,
      bestRecall: bestModelData?.metrics?.recall || 0,
    } : null;

    const compare = sensorML?.models
      ? Object.entries(sensorML.models).map(([name, m]) => ({
          name: name.replace(/_/g, ' '),
          f1: parseFloat(((m.metrics?.f1 || 0) * 100).toFixed(1)),
          anomalies: m.n_anomalies || 0,
        }))
      : [];

    const thresholdCards = [
      { label: 'Usual range', value: `${model.bands.normalLow.toFixed(2)} to ${model.bands.normalHigh.toFixed(2)}`, accent: '#059669' },
      { label: 'Unusual low', value: `< ${model.bands.unusualLow.toFixed(2)}`, accent: '#dc2626' },
      { label: 'Unusual high', value: `> ${model.bands.unusualHigh.toFixed(2)}`, accent: '#dc2626' },
      { label: 'Current status', value: model.latest.status.label, accent: model.latest.status.color },
    ];

    const recentSummary = [
      { label: 'Within usual range', value: model.recentCounts.normal, fill: '#10b981' },
      { label: 'Low side', value: model.recentCounts.warningLow + model.recentCounts.dangerLow, fill: '#f59e0b' },
      { label: 'High side', value: model.recentCounts.warningHigh + model.recentCounts.dangerHigh, fill: '#ef4444' },
    ];

    const historicalMix = [
      { label: 'Usual history', value: model.zoneCounts.normal, fill: '#10b981' },
      { label: 'Outside usual', value: model.zoneCounts.warning, fill: '#f59e0b' },
      { label: 'Historical extremes', value: model.zoneCounts.danger, fill: '#ef4444' },
    ];

    return {
      analyzed: result,
      anomalyCount: ac,
      healthScore: hs,
      distribution: buckets,
      mlInfo: info,
      modelCompare: compare,
      thresholdCards,
      latestSummary: model.latest,
      recentSummary,
      historicalMix,
      thresholdBand: model.bands,
    };
  }, [data, dataKey, mlData, thresholdData, sensorId, title, color]);

  if (!analyzed.length) {
    return <div className="card" style={{ padding: 32, textAlign: 'center' }}><p style={{ color: '#94a3b8' }}>No data for anomaly detection</p></div>;
  }

  const normalCount = Math.max(0, analyzed.length - anomalyCount);
  const pieData = [
    { name: 'Within usual', value: normalCount, fill: '#10b981' },
    { name: 'Outside usual', value: anomalyCount, fill: '#ef4444' },
  ];

  return (
    <div className="card fade-in" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{title}</h3>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            Historical pattern bands + ML anomaly model: {mlInfo?.bestModel || 'Loading...'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={anomalyCount > 0 ? 'badge badge-danger' : 'badge badge-normal'}>
            {latestSummary?.status?.label || 'Checking'}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 0, borderBottom: '1px solid #f1f5f9' }}>
        {thresholdCards.map(card => (
          <div key={card.label} style={{ padding: '14px 16px', textAlign: 'center', borderRight: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{card.label}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: card.accent, marginTop: 4 }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* KPI Row: Health Donut + ML Stats + Distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: 0, borderBottom: '1px solid #f1f5f9' }}>
        {/* Health Score Donut */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px 0', borderRight: '1px solid #f1f5f9' }}>
          <div style={{ position: 'relative', width: 80, height: 80 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={28} outerRadius={36} paddingAngle={3} dataKey="value" stroke="none" isAnimationActive={false}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: healthScore > 90 ? '#059669' : healthScore > 70 ? '#d97706' : '#dc2626' }}>{healthScore}%</span>
            </div>
          </div>
          <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginTop: 4 }}>Health Score</span>
        </div>

        {/* Current Situation */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0, padding: '12px 0' }}>
          {[
            { label: 'Current reading', value: latestSummary ? latestSummary.value.toFixed(2) : '--', accent: latestSummary?.status?.color || '#1e293b' },
            { label: 'Usual band', value: thresholdBand ? `${thresholdBand.normalLow.toFixed(2)} to ${thresholdBand.normalHigh.toFixed(2)}` : '--', accent: '#059669' },
            { label: 'Recent outside usual', value: `${recentSummary[1]?.value + recentSummary[2]?.value}`, accent: '#d97706' },
            { label: 'Historical samples', value: mlInfo?.nSamples || '--', accent: '#1e293b' },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '6px 8px', borderRight: i % 2 === 0 ? '1px solid #f1f5f9' : 'none', borderBottom: i < 2 ? '1px solid #f1f5f9' : 'none' }}>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: s.accent }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Historical band mix */}
        <div style={{ padding: '10px 12px', borderLeft: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 6, textAlign: 'center' }}>Historical Pattern Mix</div>
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={historicalMix} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="range" tick={{ fontSize: 8, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Bar dataKey="count" radius={[3, 3, 0, 0]} barSize={14} isAnimationActive={false}>
                {historicalMix.map((entry, i) => <Cell key={i} fill={entry.fill} fillOpacity={0.8} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Model Comparison */}
      {modelCompare.length > 0 && (
        <div style={{ padding: '10px 22px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>ML Model Comparison (historical anomalies)</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {modelCompare.map((m, i) => (
              <div key={i} style={{ flex: 1, padding: '6px 10px', borderRadius: 8, background: m.name === mlInfo?.bestModel ? '#eff6ff' : '#f8fafc', border: m.name === mlInfo?.bestModel ? '1px solid #3b82f6' : '1px solid #e2e8f0', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 500 }}>{m.name}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: m.f1 > 50 ? '#059669' : '#d97706' }}>{m.f1}%</div>
                <div style={{ fontSize: 9, color: '#94a3b8' }}>{m.anomalies} flagged</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Chart */}
      <div style={{ height: 220, padding: '8px 6px 0' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={analyzed} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 6" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="Timestamp" tickFormatter={formatTimestamp} stroke="transparent" tick={{ fontSize: 10, fill: '#94a3b8' }} interval="preserveStartEnd" />
            <YAxis yAxisId="value" stroke="transparent" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis yAxisId="thresholds" orientation="right" stroke="transparent" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <ReferenceArea yAxisId="value" y1={thresholdBand?.normalLow} y2={thresholdBand?.normalHigh} fill="#dcfce7" fillOpacity={0.5} />
            <ReferenceLine yAxisId="value" y={thresholdBand?.unusualLow} stroke="#ef4444" strokeDasharray="5 5" />
            <ReferenceLine yAxisId="value" y={thresholdBand?.unusualHigh} stroke="#ef4444" strokeDasharray="5 5" />
            <ReferenceLine yAxisId="value" y={thresholdBand?.normalLow} stroke="#f59e0b" strokeDasharray="4 4" />
            <ReferenceLine yAxisId="value" y={thresholdBand?.normalHigh} stroke="#f59e0b" strokeDasharray="4 4" />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload;
              return (
                <div style={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 12, padding: '10px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', fontSize: 12 }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>{d?.Timestamp}</div>
                  <div><span style={{ color: '#64748b' }}>Value: </span><b style={{ color: d?.status?.color || '#1e293b' }}>{Number(d?.value).toFixed(3)}</b></div>
                  <div><span style={{ color: '#64748b' }}>Status: </span><b style={{ color: d?.status?.color || '#1e293b' }}>{d?.status?.label}</b></div>
                  <div><span style={{ color: '#64748b' }}>Usual range: </span><b>{thresholdBand?.normalLow?.toFixed(2)} to {thresholdBand?.normalHigh?.toFixed(2)}</b></div>
                </div>
              );
            }} />
            <Bar yAxisId="value" dataKey={dataKey} barSize={3} radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {analyzed.map((entry, i) => (
                <Cell key={i} fill={entry.status.color || color} fillOpacity={entry.isAlert ? 0.9 : 0.5} />
              ))}
            </Bar>
            <Line yAxisId="value" type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} strokeOpacity={0.45} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: '10px 22px 8px' }}>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 14 }}>
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 8 }}>Recent 24-readings summary</div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={recentSummary} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Bar dataKey="value" radius={[5, 5, 0, 0]} isAnimationActive={false}>
                {recentSummary.map((entry, index) => <Cell key={index} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 14 }}>
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 8 }}>Threshold guide</div>
          <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748b' }}>Unusual low</span><b style={{ color: '#dc2626' }}>{thresholdBand?.unusualLow?.toFixed(2)} and below</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748b' }}>Low side</span><b style={{ color: '#d97706' }}>{thresholdBand?.unusualLow?.toFixed(2)} to {thresholdBand?.normalLow?.toFixed(2)}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748b' }}>Usual band</span><b style={{ color: '#059669' }}>{thresholdBand?.normalLow?.toFixed(2)} to {thresholdBand?.normalHigh?.toFixed(2)}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748b' }}>High side</span><b style={{ color: '#d97706' }}>{thresholdBand?.normalHigh?.toFixed(2)} to {thresholdBand?.unusualHigh?.toFixed(2)}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748b' }}>Unusual high</span><b style={{ color: '#dc2626' }}>{thresholdBand?.unusualHigh?.toFixed(2)} and above</b></div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 20, padding: '10px 0 14px', fontSize: 11, color: '#94a3b8' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#10b981' }} /> Within usual range</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#f59e0b' }} /> Near threshold</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#ef4444' }} /> Unusual range alert</span>
      </div>
    </div>
  );
}