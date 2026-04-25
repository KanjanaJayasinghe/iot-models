const SENSOR_CONTEXT = {
  turbidity: {
    topic: 'water clarity',
    stable: 'Water clarity looks fairly steady in the short-term outlook.',
    rising: 'Water clarity may worsen slightly over the next readings.',
    falling: 'Water clarity may improve slightly over the next readings.',
    stableAction: 'Routine site checks should be enough if this pattern holds.',
    risingAction: 'If the rise continues, compare it with runoff, sediment disturbance, or strong wave activity near the site.',
    fallingAction: 'Continue normal checks to confirm the site is settling back to clearer water.',
  },
  ph: {
    topic: 'acid-base balance',
    stable: 'pH looks steady, so acidity balance is not shifting much right now.',
    rising: 'pH is expected to move upward, which means water may become more alkaline.',
    falling: 'pH is expected to move downward, which means water may become more acidic.',
    stableAction: 'No immediate field response is suggested if readings stay in this band.',
    risingAction: 'If this rise continues, compare it with local discharge, algal activity, or recent mixing at the site.',
    fallingAction: 'If this drop continues, verify with a manual spot check and compare it with recent rainfall or runoff.',
  },
  temperature: {
    topic: 'water temperature',
    stable: 'Water temperature looks steady in the short term.',
    rising: 'Water temperature is forecast to rise.',
    falling: 'Water temperature is forecast to fall.',
    stableAction: 'Conditions look stable for routine monitoring.',
    risingAction: 'For coastal monitoring, continued warming can add heat stress, so keep an eye on nearby site conditions.',
    fallingAction: 'Cooling conditions may reduce short-term heat stress if the trend holds.',
  },
  tds: {
    topic: 'dissolved solids',
    stable: 'Dissolved solids look fairly steady in the short-term outlook.',
    rising: 'Dissolved solids may increase over the next readings.',
    falling: 'Dissolved solids may decrease over the next readings.',
    stableAction: 'Routine review is enough if this pattern holds.',
    risingAction: 'If the rise continues, compare it with mixing conditions, evaporation, or freshwater inflow changes.',
    fallingAction: 'A continued drop may reflect fresher water or better dilution at the site.',
  },
  light: {
    topic: 'surface light exposure',
    stable: 'Surface light exposure looks steady in the short-term outlook.',
    rising: 'Surface light exposure is likely to increase.',
    falling: 'Surface light exposure is likely to decrease.',
    stableAction: 'No unusual shift is suggested right now.',
    risingAction: 'Rising light can support stronger surface heating and biological activity during bright periods.',
    fallingAction: 'Lower light may reduce surface heating if the change continues.',
  },
  axis: {
    topic: 'buoy movement',
    stable: 'Buoy movement looks stable in the short term.',
    rising: 'Movement around the buoy may increase over the next readings.',
    falling: 'Movement around the buoy may ease over the next readings.',
    stableAction: 'No unusual movement pattern is suggested at this time.',
    risingAction: 'If movement keeps increasing, compare it with wave action, mooring tension, or site disturbance.',
    fallingAction: 'Movement appears to be settling back toward a calmer pattern.',
  },
};

const DEFAULT_CONTEXT = {
  topic: 'site conditions',
  stable: 'Conditions look steady in the short-term outlook.',
  rising: 'A short-term rise is projected.',
  falling: 'A short-term drop is projected.',
  stableAction: 'Routine monitoring is recommended.',
  risingAction: 'Keep watching the site if the shift continues.',
  fallingAction: 'Continue routine checks to confirm the site settles into this pattern.',
};

function getContext(sensorId) {
  return SENSOR_CONTEXT[sensorId] || DEFAULT_CONTEXT;
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

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

function formatFutureTimestamp(timestampMs) {
  const d = new Date(timestampMs);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

  function formatHoursLabel(hours) {
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }

  function formatForecastWindowLabel(hours) {
    if (!Number.isFinite(hours) || hours <= 0) return 'short-term window';
    if (hours >= 24 && hours % 24 === 0) {
      const days = hours / 24;
      return `${days}-day outlook`;
    }
    return `next ${formatHoursLabel(hours)}`;
  }

  function buildForecastCheckpoints(rawForecast, intervalMs, checkpointHours) {
    if (!rawForecast.length || !intervalMs) return [];

    return checkpointHours
      .map(hours => {
        const step = Math.ceil((hours * 60 * 60 * 1000) / intervalMs);
        if (step < 1 || step > rawForecast.length) return null;
        return {
          hours,
          index: step - 1,
          value: rawForecast[step - 1],
        };
      })
      .filter(Boolean);
  }

  function buildSampledForecastSeries(rawForecast, lastObservedMs, intervalMs, requiredIndexes, maxPoints = 180) {
    if (!rawForecast.length) return [];

    const indexes = new Set(requiredIndexes);
    indexes.add(0);
    indexes.add(rawForecast.length - 1);

    const stride = Math.max(1, Math.ceil(rawForecast.length / maxPoints));
    for (let index = 0; index < rawForecast.length; index += stride) {
      indexes.add(index);
    }

    return [...indexes]
      .sort((left, right) => left - right)
      .map(index => ({
        Timestamp: formatFutureTimestamp(lastObservedMs + intervalMs * (index + 1)),
        forecast: rawForecast[index],
      }));
  }

function getMedianIntervalMs(data) {
  const intervals = [];
  for (let index = 1; index < data.length; index += 1) {
    const previous = parseTimestampMs(data[index - 1]?.Timestamp);
    const current = parseTimestampMs(data[index]?.Timestamp);
    const diff = current - previous;
    if (diff > 0) intervals.push(diff);
  }

  return intervals.length ? median(intervals.slice(-12)) : 60_000;
}

function formatValue(value, unitLabel = '') {
  if (!Number.isFinite(value)) return '--';
  const abs = Math.abs(value);
  const maximumFractionDigits = abs >= 100 ? 1 : abs >= 10 ? 2 : 3;
  const text = value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
  return unitLabel ? `${text} ${unitLabel}` : text;
}

function formatDelta(value, unitLabel = '') {
  if (!Number.isFinite(value)) return '--';
  const abs = Math.abs(value);
  const maximumFractionDigits = abs >= 100 ? 1 : abs >= 10 ? 2 : 3;
  const text = abs.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return unitLabel ? `${sign}${text} ${unitLabel}` : `${sign}${text}`;
}

function formatModelName(name) {
  if (!name) return 'Not available';
  return name.replace(/_/g, ' ');
}

function getStatus(delta, recentRange, lastActual) {
  const referenceScale = Math.max(recentRange, Math.abs(lastActual) * 0.05, 0.01);
  const normalizedShift = Math.abs(delta) / referenceScale;

  if (normalizedShift < 0.15) {
    return {
      key: 'stable',
      label: 'Mostly steady',
      direction: 'flat',
      tone: { background: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
      priorityScore: normalizedShift,
    };
  }

  if (delta > 0) {
    const notable = normalizedShift >= 0.45;
    return {
      key: notable ? 'rise-watch' : 'rise',
      label: notable ? 'Rising - watch' : 'Slight rise',
      direction: 'up',
      tone: { background: '#fff7ed', color: '#c2410c', border: '#fdba74' },
      priorityScore: normalizedShift + (notable ? 0.25 : 0),
    };
  }

  const notable = normalizedShift >= 0.45;
  return {
    key: notable ? 'fall-watch' : 'fall',
    label: notable ? 'Falling - watch' : 'Slight fall',
    direction: 'down',
    tone: { background: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
    priorityScore: normalizedShift + (notable ? 0.25 : 0),
  };
}

function getConfidence(r2, forecastRmse, recentRange) {
  if (!Number.isFinite(r2) || !Number.isFinite(forecastRmse)) {
    return {
      label: 'Needs review',
      tone: { background: '#f8fafc', color: '#475569', border: '#cbd5e1' },
      rank: 0,
    };
  }

  const normalizedRmse = forecastRmse / Math.max(recentRange, 0.01);

  if (r2 >= 0.95 && normalizedRmse <= 0.2) {
    return {
      label: 'Higher confidence',
      tone: { background: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
      rank: 3,
    };
  }

  if (r2 >= 0.85 && normalizedRmse <= 0.45) {
    return {
      label: 'Moderate confidence',
      tone: { background: '#fffbeb', color: '#b45309', border: '#fcd34d' },
      rank: 2,
    };
  }

  return {
    label: 'Lower confidence',
    tone: { background: '#fff7ed', color: '#c2410c', border: '#fdba74' },
    rank: 1,
  };
}

function getBandNote(value, recentMin, recentMax) {
  if (value > recentMax) return 'Above recent band';
  if (value < recentMin) return 'Below recent band';
  return 'Within recent band';
}

export function buildForecastViewModel({ sensor, data, dataKey, temporalResult }) {
  if (!sensor || !data?.length || !temporalResult?.holtwinters?.forecast?.length) return null;

  const unitLabel = (sensor.unit || '').trim();
  const regression = temporalResult?.regression || null;
  const holtWinters = temporalResult?.holtwinters || null;
  const regressionMetrics = regression?.all_results?.[regression?.best_model] || null;
  const rawForecast = Array.isArray(holtWinters?.forecast)
    ? holtWinters.forecast.map(value => toFiniteNumber(value, Number.NaN)).filter(Number.isFinite)
    : [];

  const historySlice = data.slice(-Math.min(data.length, 160));
  const intervalMs = getMedianIntervalMs(data.slice(-Math.min(data.length, 20)));
  const intervalSeconds = toFiniteNumber(holtWinters?.forecast_interval_seconds, Math.max(1, Math.round(intervalMs / 1000)));
  const lastObservedMs = parseTimestampMs(historySlice[historySlice.length - 1]?.Timestamp) || Date.now();
  const historical = historySlice.map(row => ({
    Timestamp: row.Timestamp,
    actual: toFiniteNumber(row[dataKey]),
  }));
  const checkpointTargets = buildForecastCheckpoints(rawForecast, intervalMs, [2, 6, 24, 48]);
  const predicted = buildSampledForecastSeries(
    rawForecast,
    lastObservedMs,
    intervalMs,
    checkpointTargets.map(checkpoint => checkpoint.index),
  );
  const chartData = [...historical, ...predicted];

  const recentValues = data
    .slice(-Math.min(data.length, 48))
    .map(row => toFiniteNumber(row[dataKey], Number.NaN))
    .filter(Number.isFinite);

  const lastActual = historical[historical.length - 1]?.actual ?? 0;
  const recentMean = average(recentValues);
  const recentMin = recentValues.length ? Math.min(...recentValues) : lastActual;
  const recentMax = recentValues.length ? Math.max(...recentValues) : lastActual;
  const recentRange = recentMax - recentMin;
  const forecastMean = rawForecast.length ? average(rawForecast) : lastActual;
  const forecastMin = rawForecast.length ? Math.min(...rawForecast) : lastActual;
  const forecastMax = rawForecast.length ? Math.max(...rawForecast) : lastActual;
  const deltaFromNow = forecastMean - lastActual;
  const status = getStatus(deltaFromNow, recentRange, lastActual);
  const confidence = getConfidence(regressionMetrics?.r2, holtWinters?.rmse, recentRange);
  const context = getContext(sensor.id);

  const summary = status.direction === 'up'
    ? `${context.rising} The projected average is ${formatDelta(deltaFromNow, unitLabel)} from the latest reading.`
    : status.direction === 'down'
      ? `${context.falling} The projected average is ${formatDelta(deltaFromNow, unitLabel)} from the latest reading.`
      : `${context.stable} The projected average stays close to the latest reading.`;

  const fieldNote = status.direction === 'up'
    ? context.risingAction
    : status.direction === 'down'
      ? context.fallingAction
      : context.stableAction;

  const forecastHorizonHours = toFiniteNumber(
    holtWinters?.forecast_horizon_hours,
    (rawForecast.length * intervalSeconds) / 3600,
  );
  const forecastWindowLabel = formatForecastWindowLabel(Math.round(forecastHorizonHours));

  const checkpoints = checkpointTargets.map(checkpoint => {
    const value = checkpoint.value;
    return {
      key: `${sensor.id}-${checkpoint.hours}h`,
      stepLabel: `Next ${formatHoursLabel(checkpoint.hours)}`,
      value,
      valueText: formatValue(value, unitLabel),
      note: getBandNote(value, recentMin, recentMax),
    };
  });

  const comparisonBars = [
    { key: `${sensor.id}-recent-low`, label: 'Recent low', value: recentMin, fill: `${sensor.color}66` },
    { key: `${sensor.id}-recent-average`, label: 'Recent avg', value: recentMean, fill: sensor.color },
    { key: `${sensor.id}-forecast-average`, label: 'Forecast avg', value: forecastMean, fill: '#0f766e' },
    { key: `${sensor.id}-forecast-high`, label: 'Forecast high', value: forecastMax, fill: '#14b8a6' },
  ];

  const modelCompare = Object.entries(regression?.all_results || {})
    .map(([name, result]) => ({
      key: `${sensor.id}-${name}`,
      name: formatModelName(name),
      fitScore: Math.max(0, toFiniteNumber(result?.r2) * 100),
      fill: name === regression?.best_model ? sensor.color : '#94a3b8',
    }))
    .sort((left, right) => right.fitScore - left.fitScore);

  return {
    key: sensor.id,
    sensor,
    title: `${sensor.label} Outlook`,
    topic: context.topic,
    unitLabel,
    color: sensor.color,
    chartData,
    historicalCount: historical.length,
    forecastCount: rawForecast.length,
    forecastIntervalSeconds: intervalSeconds,
    forecastHorizonHours,
    forecastWindowLabel,
    forecastValues: rawForecast,
    boundaryTimestamp: historical[historical.length - 1]?.Timestamp || null,
    lastActual,
    recentMean,
    recentMin,
    recentMax,
    forecastMean,
    forecastMin,
    forecastMax,
    deltaFromNow,
    status,
    confidence,
    summary,
    fieldNote,
    checkpoints,
    comparisonBars,
    priorityScore: status.priorityScore + (confidence.rank === 1 ? 0.1 : 0),
    summaryCards: [
      {
        key: `${sensor.id}-current`,
        label: 'Current reading',
        value: formatValue(lastActual, unitLabel),
        note: 'Latest observed reading',
        accent: sensor.color,
      },
      {
        key: `${sensor.id}-next-average`,
        label: 'Projected next average',
        value: formatValue(forecastMean, unitLabel),
        note: `Average across the ${forecastWindowLabel}`,
        accent: '#0f766e',
      },
      {
        key: `${sensor.id}-range`,
        label: 'Likely band',
        value: `${formatValue(forecastMin, unitLabel)} to ${formatValue(forecastMax, unitLabel)}`,
        note: `Expected spread across the ${forecastWindowLabel}`,
        accent: '#334155',
      },
      {
        key: `${sensor.id}-shift`,
        label: 'Expected shift',
        value: status.key === 'stable' ? 'Mostly steady' : formatDelta(deltaFromNow, unitLabel),
        note: status.key === 'stable'
          ? 'Close to current conditions'
          : status.direction === 'up'
            ? 'Above latest reading'
            : 'Below latest reading',
        accent: status.direction === 'up' ? '#c2410c' : status.direction === 'down' ? '#1d4ed8' : '#047857',
      },
    ],
    technical: {
      forecastMethod: holtWinters?.forecast_method || 'Holt-Winters',
      trendType: holtWinters?.trend_type || 'Not available',
      bestRegressionModel: formatModelName(regression?.best_model),
      fitScore: regressionMetrics?.r2 ?? null,
      regressionMae: regressionMetrics?.mae ?? null,
      regressionRmse: regressionMetrics?.rmse ?? null,
      forecastMae: holtWinters?.mae ?? null,
      forecastRmse: holtWinters?.rmse ?? null,
      nSamples: regression?.n_samples ?? null,
      nFeatures: regression?.n_features ?? null,
      forecastSteps: holtWinters?.forecast_steps ?? rawForecast.length,
      forecastHorizonHours,
      trainPoints: holtWinters?.train_points ?? null,
      validationPoints: holtWinters?.validation_points ?? null,
      modelCompare,
    },
  };
}