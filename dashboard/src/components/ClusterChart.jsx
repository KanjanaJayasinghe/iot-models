import { useMemo, useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { loadClusteringResults } from '../utils/mlResults';

const CLUSTER_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];
const CLUSTER_BG = ['#eff6ff', '#ecfdf5', '#f5f3ff', '#fffbeb', '#fef2f2', '#ecfeff', '#fdf2f8'];
const FALLBACK_RECENT_COUNT = 240;

const SENSOR_CLUSTER_COPY = {
  turbidity: {
    names: ['Clearer water state', 'Murkier water state', 'Most turbid water state'],
    insights: [
      'This group reflects the clearer water pattern seen at the site.',
      'This group reflects murkier water than the usual site pattern.',
      'This group reflects the most disturbed water-clarity pattern in the record.',
    ],
    actions: [
      'Routine site checks are usually enough while this state remains dominant.',
      'If this state expands, compare it with runoff, sediment disturbance, or strong wave activity.',
      'Treat this state as a field-check priority because water clarity is well above the usual cluster.',
    ],
  },
  ph: {
    names: ['Lower pH state', 'Higher pH state', 'Highest pH state'],
    insights: [
      'This group reflects the lower side of the site pH pattern.',
      'This group reflects the higher side of the site pH pattern.',
      'This group reflects the most alkaline pH pattern in the record.',
    ],
    actions: [
      'Use spot checks to confirm whether this lower-pH state is persisting.',
      'Track this state if alkalinity changes matter for reef-site conditions or inflow changes.',
      'Escalate field review if this highest-pH state starts to appear more often.',
    ],
  },
  temperature: {
    names: ['Cooler water state', 'Typical temperature state', 'Warmer water state'],
    insights: [
      'This group captures the cooler part of the site temperature pattern.',
      'This group reflects the temperature band seen most often at the site.',
      'This group reflects warmer water than the site norm.',
    ],
    actions: [
      'Continue normal checks if the site remains in this cooler state.',
      'Use this state as the reference pattern for routine field comparison.',
      'If this state grows, watch for heat build-up and possible coastal heat stress.',
    ],
  },
  tds: {
    names: ['Lower dissolved-solids state', 'Higher dissolved-solids state', 'Highest dissolved-solids state'],
    insights: [
      'This group reflects the lower dissolved-solids pattern at the site.',
      'This group reflects more dissolved material in the water than the usual state.',
      'This group reflects the highest dissolved-solids pattern in the record.',
    ],
    actions: [
      'Routine review is usually enough while this lower-solids state remains dominant.',
      'If this state grows, compare it with salinity change, mixing, inflow, or contamination signals.',
      'Treat this state as a higher-priority water-quality check because dissolved solids are far above the usual pattern.',
    ],
  },
  axis: {
    names: ['Calmer motion state', 'Rougher motion state', 'Strongest motion state'],
    insights: [
      'This group reflects calmer buoy movement and steadier surface conditions.',
      'This group reflects stronger buoy movement than the calmer site pattern.',
      'This group reflects the roughest motion pattern in the record.',
    ],
    actions: [
      'Use this state as the calmer motion baseline for normal operations.',
      'If this state becomes more common, compare it with wave action, wind, or mooring stress.',
      'Treat this state as a rough-condition warning for field operations near the site.',
    ],
  },
};

function parseTimestampMs(timestamp) {
  if (!timestamp) return 0;
  const asDate = new Date(timestamp);
  if (!Number.isNaN(asDate.getTime())) return asDate.getTime();

  const match = /^(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2}):(\d{2})$/.exec(timestamp);
  if (!match) return 0;

  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  ).getTime();
}

function getMedianIntervalMs(rows) {
  const diffs = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1]?.ts || parseTimestampMs(rows[index - 1]?.Timestamp);
    const current = rows[index]?.ts || parseTimestampMs(rows[index]?.Timestamp);
    const diff = current - previous;
    if (diff > 0) diffs.push(diff);
  }

  if (!diffs.length) return 0;
  const sorted = [...diffs].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function formatValue(value) {
  if (!Number.isFinite(value)) return '--';
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(value) >= 10 ? 2 : 3,
  });
}

function formatValueWithUnit(value, unit) {
  const text = formatValue(value);
  return unit ? `${text} ${unit}` : text;
}

function nearestClusterIndex(value, centroids) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  centroids.forEach((centroid, index) => {
    const distance = Math.abs(value - centroid);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function getClusterCopy(sensorId, rank, totalClusters) {
  const config = SENSOR_CLUSTER_COPY[sensorId];
  if (config) {
    const safeIndex = Math.min(rank, config.names.length - 1);
    return {
      name: config.names[safeIndex],
      insight: config.insights[safeIndex],
      action: config.actions[safeIndex],
    };
  }

  const fallbackNames = totalClusters === 2
    ? ['Lower state', 'Higher state']
    : ['Lower state', 'Typical state', 'Higher state'];
  const safeFallback = Math.min(rank, fallbackNames.length - 1);
  return {
    name: fallbackNames[safeFallback] || `State ${rank + 1}`,
    insight: 'This group captures one of the repeating reading patterns in the site history.',
    action: 'Compare this state with recent field conditions if it begins appearing more often.',
  };
}

function describeRecentWindow(rowCount, intervalMs) {
  if (!rowCount) return 'recent readings';
  if (!intervalMs) return `latest ${rowCount} readings`;

  const totalHours = (rowCount * intervalMs) / 3600000;
  if (totalHours >= 24) {
    const days = Math.round((totalHours / 24) * 10) / 10;
    return `recent ${days} day${days === 1 ? '' : 's'}`;
  }
  if (totalHours >= 1) {
    const hours = Math.round(totalHours * 10) / 10;
    return `recent ${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return `latest ${rowCount} readings`;
}

export default function ClusterChart({ data, dataKey, title, sensorId }) {
  const [mlData, setMlData] = useState(null);

  useEffect(() => {
    loadClusteringResults().then(setMlData);
  }, []);

  const {
    summary,
    total,
    mlInfo,
    overviewCards,
    headline,
    summaryText,
    recentChartData,
    overallChartData,
    recentWindowLabel,
  } = useMemo(() => {
    if (!data?.length) {
      return {
        summary: [],
        total: 0,
        mlInfo: null,
        overviewCards: [],
        headline: '',
        summaryText: '',
        recentChartData: [],
        overallChartData: [],
        recentWindowLabel: 'recent readings',
      };
    }

    const perSensor = mlData?.per_sensor?.[sensorId];
    if (!perSensor) {
      return {
        summary: [],
        total: 0,
        mlInfo: null,
        overviewCards: [],
        headline: '',
        summaryText: '',
        recentChartData: [],
        overallChartData: [],
        recentWindowLabel: 'recent readings',
      };
    }

    const optimalK = perSensor.optimal_k;
    const silhouette = perSensor.silhouette;
    const centroids = perSensor.centroids || [];
    const labelNames = perSensor.label_names || {};
    const clusterSizes = perSensor.cluster_sizes || {};

    const totalPts = Object.values(clusterSizes).reduce((a, b) => a + b, 0);
    const records = data
      .map((row) => ({
        ...row,
        value: Number(row[dataKey]),
      }))
      .filter((row) => Number.isFinite(row.value))
      .map((row) => ({
        ...row,
        clusterIdx: nearestClusterIndex(row.value, centroids),
      }));

    const sortedByCentroid = centroids
      .map((centroid, idx) => ({ idx, centroid: Number(centroid) }))
      .sort((left, right) => left.centroid - right.centroid);
    const rankByIndex = Object.fromEntries(sortedByCentroid.map((item, rank) => [item.idx, rank]));

    const intervalMs = getMedianIntervalMs(records.slice(-Math.min(records.length, 240)));
    const recentCount = Math.min(records.length, FALLBACK_RECENT_COUNT);
    const recentRows = records.slice(-recentCount);
    const recentWindowLabel = describeRecentWindow(recentRows.length, intervalMs);

    const sum = sortedByCentroid.map((item, displayIndex) => {
      const idx = item.idx;
      const modelCount = clusterSizes[String(idx)] || 0;
      const assigned = records.filter((row) => row.clusterIdx === idx);
      const recentAssigned = recentRows.filter((row) => row.clusterIdx === idx);
      const values = assigned.map((row) => row.value);
      const percentage = totalPts > 0 ? Number.parseFloat(((modelCount / totalPts) * 100).toFixed(1)) : 0;
      const recentShare = recentRows.length > 0
        ? Number.parseFloat(((recentAssigned.length / recentRows.length) * 100).toFixed(1))
        : 0;
      const copy = getClusterCopy(sensorId, displayIndex, sortedByCentroid.length);
      const recentAverage = recentAssigned.length
        ? recentAssigned.reduce((totalValue, row) => totalValue + row.value, 0) / recentAssigned.length
        : item.centroid;

      return {
        idx,
        rawName: labelNames[String(idx)] || `Cluster ${idx + 1}`,
        name: copy.name,
        count: modelCount,
        centroid: Number.parseFloat(item.centroid.toFixed(3)),
        percentage,
        recentCount: recentAssigned.length,
        recentShare,
        min: values.length ? Math.min(...values) : item.centroid,
        max: values.length ? Math.max(...values) : item.centroid,
        recentAverage: Number.parseFloat(recentAverage.toFixed(3)),
        insight: copy.insight,
        action: copy.action,
        color: CLUSTER_COLORS[displayIndex % CLUSTER_COLORS.length],
        background: CLUSTER_BG[displayIndex % CLUSTER_BG.length],
      };
    }).filter((cluster) => cluster.count > 0);

    const dominantCluster = [...sum].sort((left, right) => right.percentage - left.percentage)[0];
    const latestCluster = records.length
      ? sum.find((cluster) => cluster.idx === records[records.length - 1].clusterIdx)
      : null;
    const watchCluster = [...sum]
      .filter((cluster) => cluster.idx !== dominantCluster?.idx)
      .sort((left, right) => right.percentage - left.percentage)[0] || dominantCluster;

    const overallChartData = sum.map((cluster) => ({
      name: cluster.name,
      share: cluster.percentage,
      count: cluster.count,
      fill: cluster.color,
    }));
    const recentChartData = sum.map((cluster) => ({
      name: cluster.name,
      share: cluster.recentShare,
      count: cluster.recentCount,
      fill: cluster.color,
    }));

    const info = {
      optimalK,
      silhouette: Number(silhouette).toFixed(4),
      totalSamples: totalPts,
      method: 'K-Means (scikit-learn)',
    };

    const headline = latestCluster && dominantCluster && latestCluster.idx === dominantCluster.idx
      ? `Most readings stay in the ${dominantCluster.name.toLowerCase()}. The latest reading is still inside that usual site pattern.`
      : latestCluster && dominantCluster
        ? `Most readings stay in the ${dominantCluster.name.toLowerCase()}, but the latest reading has shifted into the ${latestCluster.name.toLowerCase()}.`
        : 'This chart groups repeated site conditions into easy-to-read water-quality states.';

    const summaryText = dominantCluster && watchCluster
      ? `${dominantCluster.percentage}% of the historical readings fall into the ${dominantCluster.name.toLowerCase()}. The main state to watch is the ${watchCluster.name.toLowerCase()}, which appears in ${watchCluster.percentage}% of the record.`
      : 'These cluster groups show the repeating site states found in the sensor history.';

    const overviewCards = [
      dominantCluster && {
        key: 'usual-state',
        label: 'Most common site state',
        value: dominantCluster.name,
        note: `${dominantCluster.percentage}% of the historical record`,
        accent: dominantCluster.color,
      },
      latestCluster && {
        key: 'latest-state',
        label: 'Current reading state',
        value: latestCluster.name,
        note: `Latest reading sits near ${formatValue(latestCluster.centroid)}`,
        accent: latestCluster.color,
      },
      watchCluster && {
        key: 'watch-state',
        label: 'State to watch',
        value: watchCluster.name,
        note: `${watchCluster.percentage}% of the record, ${watchCluster.recentShare}% in the ${recentWindowLabel}`,
        accent: watchCluster.color,
      },
      {
        key: 'cluster-count',
        label: 'Decision groups found',
        value: `${sum.length}`,
        note: 'Distinct site states identified for this sensor',
        accent: '#0f766e',
      },
    ].filter(Boolean);

    return {
      summary: sum,
      total: totalPts,
      mlInfo: info,
      overviewCards,
      headline,
      summaryText,
      recentChartData,
      overallChartData,
      recentWindowLabel,
    };
  }, [data, dataKey, mlData, sensorId]);

  if (!summary.length) {
    return <div className="card" style={{ padding: 32, textAlign: 'center' }}><p style={{ color: '#94a3b8' }}>No ML clustering data available</p></div>;
  }

  return (
    <div className="card fade-in" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #f1f5f9' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{title}</h3>
        <p style={{ fontSize: 18, color: '#0f172a', fontWeight: 800, marginTop: 10, lineHeight: 1.35 }}>
          {headline}
        </p>
        <p style={{ fontSize: 12, color: '#64748b', marginTop: 8, lineHeight: 1.6, maxWidth: 960 }}>
          {summaryText}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, padding: '16px 22px' }}>
        {overviewCards.map((card) => (
          <div key={card.key} style={{ padding: '14px 16px', borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff' }}>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{card.label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: card.accent, marginTop: 8, lineHeight: 1.25 }}>{card.value}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 8, lineHeight: 1.5 }}>{card.note}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, padding: '0 22px 18px' }}>
        {summary.map((s, i) => (
          <div key={s.name} style={{ padding: '16px 18px', borderRadius: 18, border: '1px solid #e2e8f0', background: s.background }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{s.name}</span>
              <span style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 800, color: s.color }}>{s.percentage}%</span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', lineHeight: 1.5 }}>{s.insight}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
              {[
                { label: 'Typical center', value: formatValue(s.centroid) },
                { label: 'Typical range', value: `${formatValue(s.min)} to ${formatValue(s.max)}` },
                { label: 'History share', value: `${s.percentage}%` },
                { label: `${recentWindowLabel} share`, value: `${s.recentShare}%` },
              ].map((stat, j) => (
                <div key={j} style={{ padding: '8px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.65)' }}>
                  <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>{stat.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginTop: 3 }}>{stat.value}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Field note</div>
              <div style={{ fontSize: 12, color: '#475569', marginTop: 6, lineHeight: 1.55 }}>{s.action}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: '0 22px 18px' }}>
        <div style={{ padding: '14px 14px 6px', borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff', minHeight: 240 }}>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Long-term state share</div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Shows how much of the full history falls into each site state.</div>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={overallChartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 6" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 10, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 11 }}>
                    <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{d.name}</div>
                    <div>History share: <b>{d.share}%</b></div>
                    <div>Readings: <b>{d.count.toLocaleString()}</b></div>
                  </div>
                );
              }} />
              <Bar dataKey="share" radius={[8, 8, 0, 0]} barSize={40} isAnimationActive={false}>
                {overallChartData.map((entry, index) => <Cell key={index} fill={entry.fill} fillOpacity={0.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ padding: '14px 14px 6px', borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff', minHeight: 240 }}>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{recentWindowLabel} mix</div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Shows which site states are appearing most often in the latest readings.</div>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={recentChartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 6" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ background: '#fff', border: '1px solid #e8ecf1', borderRadius: 10, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 11 }}>
                    <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{d.name}</div>
                    <div>{recentWindowLabel} share: <b>{d.share}%</b></div>
                    <div>Readings in window: <b>{d.count}</b></div>
                  </div>
                );
              }} />
              <Bar dataKey="share" radius={[8, 8, 0, 0]} barSize={40} isAnimationActive={false}>
                {recentChartData.map((entry, index) => <Cell key={index} fill={entry.fill} fillOpacity={0.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {mlInfo && (
        <div style={{ padding: '0 22px 22px' }}>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 18, overflow: 'hidden', background: '#fff' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Model details</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                Technical quality checks are kept here so the cluster meaning above stays focused on environmental interpretation.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 0, borderBottom: '1px solid #f1f5f9' }}>
              {[
                { label: 'Algorithm', value: mlInfo.method },
                { label: 'Decision groups', value: mlInfo.optimalK },
                { label: 'Silhouette', value: mlInfo.silhouette },
                { label: 'Training samples', value: total.toLocaleString() },
              ].map((item, index) => (
                <div key={item.label} style={{ padding: '12px 14px', borderRight: index < 3 ? '1px solid #f1f5f9' : 'none' }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginTop: 6 }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Cluster centers used by the model</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                {summary.map((cluster) => (
                  <div key={`${cluster.name}-tech`} style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: cluster.color }}>{cluster.name}</div>
                    <div style={{ fontSize: 12, color: '#475569', marginTop: 6, lineHeight: 1.5 }}>
                      Center: <b>{formatValue(cluster.centroid)}</b><br />
                      Range seen in assigned data: <b>{formatValue(cluster.min)} to {formatValue(cluster.max)}</b><br />
                      Historical share: <b>{cluster.percentage}%</b>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}