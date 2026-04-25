import { useState, useEffect, useRef, useMemo } from 'react';
import { database, ref, get, onChildAdded, query, limitToLast, orderByKey, startAfter } from '../firebase';
import { SENSORS, detectValueKeys } from '../config/sensors';

// Max historical records to load on startup per sensor
const MAX_POINTS = 100;

// Debounce ms for real-time updates — avoids a re-render per new record
const DEBOUNCE_MS = 500;

// Process a raw Firebase record into a normalized entry
function parseRecord(key, value) {
  return {
    id: key,
    ...value,
    Timestamp: value.Timestamp || '',
    ts: value.Timestamp ? new Date(value.Timestamp).getTime() : 0,
  };
}

// Apply sensor-specific transforms in place
function transformEntry(entry, sensorId, keys) {
  if (sensorId === 'temperature') {
    keys.forEach(k => {
      const f = Number(entry[k]);
      if (!isNaN(f)) entry[k] = parseFloat(((f - 32) * 5 / 9).toFixed(2));
    });
  }
  if (keys.length > 1) {
    const mag = Math.sqrt(keys.reduce((sum, k) => sum + Math.pow(Number(entry[k]) || 0, 2), 0));
    entry._magnitude = parseFloat(mag.toFixed(3));
  }
  return entry;
}

export function useFirebaseData() {
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

    SENSORS.forEach(sensor => {
      // ── Step 1: one-time historical fetch (only runs once) ──────────────
      const histQuery = query(
        ref(database, sensor.path),
        orderByKey(),
        limitToLast(MAX_POINTS)
      );

      get(histQuery).then(snapshot => {
        if (cancelled) return;

        let records = [];
        if (snapshot.exists()) {
          snapshot.forEach(child => {
            const entry = parseRecord(child.key, child.val());
            records.push(entry);
          });
          records.sort((a, b) => a.ts - b.ts);
        }

        // Detect value keys from first record
        if (records.length > 0) {
          const keys = detectValueKeys(records[0]);
          valueKeysRef.current[sensor.id] = keys;
          records = records.map(e => transformEntry(e, sensor.id, keys));
        }

        liveBufferRef.current[sensor.id] = records;

        // Track when all sensors have finished initial load
        loadedCountRef.current += 1;
        if (loadedCountRef.current >= SENSORS.length) {
          // All done — flush to state immediately and stop loading
          if (timerRef.current) clearTimeout(timerRef.current);
          flush();
          setValueKeys({ ...valueKeysRef.current });
          setLoading(false);

          // ── Step 2: start real-time listener for NEW records only ──────
          SENSORS.forEach(s => {
            const buf = liveBufferRef.current[s.id];
            const lastKey = buf?.length > 0 ? buf[buf.length - 1].id : null;

            const rtQuery = lastKey
              ? query(ref(database, s.path), orderByKey(), startAfter(lastKey))
              : query(ref(database, s.path), orderByKey(), limitToLast(1));

            const unsub = onChildAdded(rtQuery, childSnapshot => {
              if (cancelled) return;
              const keys = valueKeysRef.current[s.id] || [];
              const entry = transformEntry(
                parseRecord(childSnapshot.key, childSnapshot.val()),
                s.id, keys
              );

              const buf = liveBufferRef.current[s.id] || [];
              // Avoid duplicates
              if (buf.some(r => r.id === entry.id)) return;

              const updated = [...buf, entry];
              // Keep only the last MAX_POINTS
              liveBufferRef.current[s.id] = updated.length > MAX_POINTS
                ? updated.slice(-MAX_POINTS)
                : updated;

              scheduleFlush();
            });

            cleanups.push(unsub);
          });
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
  }, []);  // runs once on mount

  // Memoized merged data — only recalculates when data actually changes
  const mergedData = useMemo(() => {
    const allTimestamps = new Map();

    SENSORS.forEach((sensor) => {
      const data = sensorData[sensor.id];
      const keys = valueKeys[sensor.id];
      if (!data?.length || !keys?.length) return;

      const vKey = keys.length > 1 ? '_magnitude' : keys[0];

      data.forEach((d) => {
        const tsKey = d.Timestamp;
        if (!allTimestamps.has(tsKey)) {
          allTimestamps.set(tsKey, { Timestamp: d.Timestamp, ts: d.ts });
        }
        const row = allTimestamps.get(tsKey);
        row[sensor.id] = parseFloat(d[vKey]) || 0;
      });
    });

    return Array.from(allTimestamps.values()).sort((a, b) => a.ts - b.ts);
  }, [sensorData, valueKeys]);

  return { sensorData, valueKeys, mergedData, loading, error, lastUpdated };
}
