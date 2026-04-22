// ── Sensor Configuration ──
// Central config for all IoT buoy sensors. Every component reads from here.

export const SENSORS = [
  {
    id: 'turbidity',
    path: 'test-data/Turbidity',
    label: 'Turbidity',
    unit: 'NTU',
    color: '#8b5cf6',
    colorLight: '#a78bfa',
    variant: 'turbidity',
  },
  {
    id: 'ph',
    path: 'test-data/pH',
    label: 'pH Level',
    unit: 'pH',
    color: '#14b8a6',
    colorLight: '#5eead4',
    variant: 'ph',
  },
  {
    id: 'temperature',
    path: 'test-data/Temperature',
    label: 'Temperature',
    unit: '°C',
    color: '#10b981',
    colorLight: '#6ee7b7',
    variant: 'temperature',
  },
  {
    id: 'tds',
    path: 'test-data/TDS',
    label: 'TDS',
    unit: 'ppm',
    color: '#38bdf8',
    colorLight: '#7dd3fc',
    variant: 'tds',
  },
  {
    id: 'light',
    path: 'test-data/Light',
    label: 'Light',
    unit: 'lux',
    color: '#22d3ee',
    colorLight: '#67e8f9',
    variant: 'light',
  },
  {
    id: 'axis',
    path: 'test-data/Axis',
    label: 'Motion',
    unit: '',
    color: '#60a5fa',
    colorLight: '#93c5fd',
    variant: 'axis',
  },
];

/**
 * Auto-detect the numeric value key(s) from a Firebase record.
 * Excludes metadata fields like Timestamp, SensorID, etc.
 */
const META_KEYS = new Set(['id', 'Timestamp', 'ts', 'SensorID', 'sensorId', 'sensor_id']);

export function detectValueKeys(record) {
  if (!record) return [];
  return Object.keys(record).filter(k => {
    if (META_KEYS.has(k)) return false;
    const v = record[k];
    return typeof v === 'number' || (typeof v === 'string' && v !== '' && !isNaN(Number(v)));
  });
}

/**
 * Get the primary value key for a sensor.
 * For multi-value sensors (e.g. Axis with X,Y,Z), returns '_magnitude'.
 */
export function getValueKey(sensorId, valueKeys) {
  const keys = valueKeys[sensorId];
  if (!keys || keys.length === 0) return sensorId;
  if (keys.length > 1) return '_magnitude';
  return keys[0];
}
