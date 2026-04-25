import { useState, useEffect, useRef, useMemo } from 'react';
import { database, ref, get, onChildAdded, query, orderByKey, orderByChild, startAt, endAt, startAfter } from '../firebase';
import { SENSORS, detectValueKeys, getValueKey } from '../config/sensors';

// Debounce ms for real-time updates — avoids a re-render per new record
const DEBOUNCE_MS = 500;
const TIMESTAMP_DB_PATTERN = /^(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2}):(\d{2})$/;

function parseTimestampToMs(ts) {
  if (!ts || typeof ts !== 'string') return 0;

  // Supports both ISO strings and DB format: YYYY-MM-DD HH:mm:ss
  if (ts.includes('T')) {
    const ms = new Date(ts).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }

  const m = TIMESTAMP_DB_PATTERN.exec(ts);
  if (!m) {
    const ms = new Date(ts).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }

  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  return new Date(year, month, day, hour, minute, second).getTime();
}

function formatRangeTimestamp(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}

// Process a raw Firebase record into a normalized entry
function parseRecord(key, value) {
  return {
    id: key,
    ...value,
    Timestamp: value.Timestamp || '',
    ts: parseTimestampToMs(value.Timestamp),
  };
}

function transformEntry(entry, sensor) {
  const normalized = { ...entry };

  if (sensor.id === 'temperature') {
    const celsius = Number(normalized.Celsius);
    const fahrenheit = Number(normalized.Fahrenheit);
    const nextValue = Number.isFinite(celsius)
      ? celsius
      : Number.isFinite(fahrenheit)
        ? (fahrenheit - 32) * 5 / 9
        : Number.NaN;

    if (!Number.isFinite(nextValue) || nextValue < -5 || nextValue > 45) return null;
    normalized.Celsius = Number.parseFloat(nextValue.toFixed(2));
    return normalized;
  }

  if (sensor.id === 'axis') {
    const accel = sensor.accelKeys.map(key => Number(normalized[key]));
    const gravity = sensor.gravityKeys.map(key => Number(normalized[key]));
    if ([...accel, ...gravity].some(value => !Number.isFinite(value))) return null;

    const motion = Math.sqrt(
      accel.reduce((sum, value, index) => sum + Math.pow(value - gravity[index], 2), 0)
    );

    normalized._magnitude = Number.parseFloat(motion.toFixed(3));
    return normalized;
  }

  const value = Number(normalized[sensor.valueKey]);
  if (!Number.isFinite(value)) return null;
  if (sensor.id === 'light' && value < 0) return null;
  if (sensor.id === 'ph' && (value < 0 || value > 14)) return null;
  if ((sensor.id === 'tds' || sensor.id === 'turbidity') && value < 0) return null;

  normalized[sensor.valueKey] = Number.parseFloat(value.toFixed(3));
  return normalized;
}

function removeOutliers(records, sensor) {
  if (!records.length || !sensor.valueKey) return records;

  const values = records
    .map(record => Number(record[sensor.valueKey]))
    .filter(Number.isFinite);

  if (values.length < 24) return records;

  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (p) => {
    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  };

  const q1 = percentile(0.25);
  const q3 = percentile(0.75);
  const iqr = q3 - q1;
  if (!Number.isFinite(iqr) || iqr <= 0) return records;

  const lower = q1 - 3 * iqr;
  const upper = q3 + 3 * iqr;
  return records.filter(record => {
    const value = Number(record[sensor.valueKey]);
    return Number.isFinite(value) && value >= lower && value <= upper;
  });
}

export function useFirebaseData(dateRange = null) {
  // dateRange: { start: Date, end: Date } for historical mode, null for live mode
  const [sensorData, setSensorData] = useState({});
  const [valueKeys, setValueKeys] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Live data buffer — updated by onChildAdded, flushed to state on debounce
  const liveBufferRef = useRef({});   // { sensorId: [...records] }
  const timerRef = useRef(null);
  const loadedCountRef = useRef(0);
  const valueKeysRef = useRef({});    // keep keys in ref to avoid stale closure

  useEffect(() => {
    loadedCountRef.current = 0;
    liveBufferRef.current = {};
    valueKeysRef.current = {};
    setSensorData({});
    setLoading(true);
    setError(null);
    let cancelled = false;
    const cleanups = [];

    const flush = () => {
      if (cancelled) return;
      const snap = {};
      for (const id of Object.keys(liveBufferRef.current)) {
        snap[id] = [...liveBufferRef.current[id]];
      }
      setSensorData(snap);
      setLastUpdated(new Date());
    };

    const scheduleFlush = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, DEBOUNCE_MS);
    };

    // Build the Firebase query for initial fetch
    // Historical mode: orderByChild("Timestamp") + startAt + endAt → full date range
    // Live mode: orderByKey → full available history
    const isHistorical = dateRange && dateRange.start && dateRange.end;

    SENSORS.forEach(sensor => {
      let fetchQuery;
      if (isHistorical) {
        // Fetch all records within the selected date range
        const startTS = formatRangeTimestamp(dateRange.start);
        const endTS   = formatRangeTimestamp(dateRange.end);
        fetchQuery = query(
          ref(database, sensor.path),
          orderByChild('Timestamp'),
          startAt(startTS),
          endAt(endTS)
        );
      } else {
        // Live mode — load all available records
        fetchQuery = query(
          ref(database, sensor.path),
          orderByKey()
        );
      }

      get(fetchQuery).then(snapshot => {
        if (cancelled) return;

        let records = [];
        if (snapshot.exists()) {
          snapshot.forEach(child => {
            const entry = parseRecord(child.key, child.val());
            records.push(entry);
          });
          records.sort((a, b) => a.ts - b.ts);
        }

        if (records.length > 0) {
          const keys = detectValueKeys(records[0], sensor.id);
          valueKeysRef.current[sensor.id] = keys;
          records = records
            .map(e => transformEntry(e, sensor))
            .filter(Boolean);
          records = removeOutliers(records, sensor);
        }

        liveBufferRef.current[sensor.id] = records;

        loadedCountRef.current += 1;
        if (loadedCountRef.current >= SENSORS.length) {
          if (timerRef.current) clearTimeout(timerRef.current);
          flush();
          setValueKeys({ ...valueKeysRef.current });
          setLoading(false);

          // ── Real-time listener — only in live mode ──────────────────────
          if (!isHistorical) {
            SENSORS.forEach(s => {
              const buf = liveBufferRef.current[s.id];
              const lastKey = buf?.length > 0 ? buf[buf.length - 1].id : null;

              const rtQuery = lastKey
                ? query(ref(database, s.path), orderByKey(), startAfter(lastKey))
                : query(ref(database, s.path), orderByKey());

              const unsub = onChildAdded(rtQuery, childSnapshot => {
                if (cancelled) return;
                const entry = transformEntry(parseRecord(childSnapshot.key, childSnapshot.val()), s);
                if (!entry) return;

                const buf = liveBufferRef.current[s.id] || [];
                if (buf.some(r => r.id === entry.id)) return;

                liveBufferRef.current[s.id] = [...buf, entry];

                scheduleFlush();
              });

              cleanups.push(unsub);
            });
          }
        }
      }).catch(err => {
        if (cancelled) return;
        setError(err.message);
        loadedCountRef.current += 1;
        if (loadedCountRef.current >= SENSORS.length) setLoading(false);
      });
    });

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      cleanups.forEach(fn => fn());
    };
  // Re-run whenever the date range changes (or on first mount when null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dateRange?.start?.toISOString(),
    dateRange?.end?.toISOString(),
  ]);

  // Memoized merged data — only recalculates when data actually changes
  const mergedData = useMemo(() => {
    const allTimestamps = new Map();

    SENSORS.forEach((sensor) => {
      const data = sensorData[sensor.id];
      const keys = valueKeys[sensor.id];
      if (!data?.length || !keys?.length) return;

      const vKey = getValueKey(sensor.id, valueKeys);

      data.forEach((d) => {
        const tsKey = d.Timestamp;
        if (!allTimestamps.has(tsKey)) {
          allTimestamps.set(tsKey, { Timestamp: d.Timestamp, ts: d.ts });
        }
        const row = allTimestamps.get(tsKey);
        row[sensor.id] = Number.parseFloat(d[vKey]) || 0;
      });
    });

    return Array.from(allTimestamps.values()).sort((a, b) => a.ts - b.ts);
  }, [sensorData, valueKeys]);

  return { sensorData, valueKeys, mergedData, loading, error, lastUpdated, isHistorical: !!(dateRange?.start && dateRange?.end) };
}
