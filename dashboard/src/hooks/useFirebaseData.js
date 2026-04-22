import { useState, useEffect, useCallback, useRef } from 'react';
import { database, ref, onValue } from '../firebase';
import { SENSORS, detectValueKeys } from '../config/sensors';

export function useFirebaseData() {
  const [sensorData, setSensorData] = useState({});
  const [valueKeys, setValueKeys] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const loadedIds = useRef(new Set());

  const parseSnapshot = useCallback((snapshot) => {
    if (!snapshot.exists()) return [];
    const raw = snapshot.val();
    return Object.entries(raw)
      .map(([key, value]) => ({
        id: key,
        ...value,
        Timestamp: value.Timestamp || '',
        ts: value.Timestamp ? new Date(value.Timestamp).getTime() : 0,
      }))
      .sort((a, b) => a.ts - b.ts);
  }, []);

  useEffect(() => {
    setLoading(true);
    loadedIds.current = new Set();
    const unsubscribers = [];

    SENSORS.forEach((sensor) => {
      const sensorRef = ref(database, sensor.path);

      const unsub = onValue(
        sensorRef,
        (snapshot) => {
          try {
            const data = parseSnapshot(snapshot);

            // Auto-detect value key(s) from first record
            if (data.length > 0) {
              const keys = detectValueKeys(data[0]);
              setValueKeys((prev) => ({ ...prev, [sensor.id]: keys }));

              // Convert temperature from Fahrenheit (stored in Firebase) to Celsius
              if (sensor.id === 'temperature') {
                data.forEach((entry) => {
                  keys.forEach((k) => {
                    const f = Number(entry[k]);
                    if (!isNaN(f)) entry[k] = parseFloat(((f - 32) * 5 / 9).toFixed(2));
                  });
                });
              }

              // For multi-value sensors (Axis X,Y,Z), compute magnitude
              if (keys.length > 1) {
                data.forEach((entry) => {
                  const mag = Math.sqrt(
                    keys.reduce((sum, k) => sum + Math.pow(Number(entry[k]) || 0, 2), 0)
                  );
                  entry._magnitude = parseFloat(mag.toFixed(3));
                });
              }
            }

            setSensorData((prev) => ({ ...prev, [sensor.id]: data }));
            setLastUpdated(new Date());

            loadedIds.current.add(sensor.id);
            if (loadedIds.current.size >= SENSORS.length) {
              setLoading(false);
            }
          } catch (err) {
            setError(err.message);
            loadedIds.current.add(sensor.id);
            if (loadedIds.current.size >= SENSORS.length) setLoading(false);
          }
        },
        (err) => {
          setError(err.message);
          loadedIds.current.add(sensor.id);
          if (loadedIds.current.size >= SENSORS.length) setLoading(false);
        }
      );

      unsubscribers.push(unsub);
    });

    return () => unsubscribers.forEach((fn) => fn());
  }, [parseSnapshot]);

  // Build merged data: all sensors merged by timestamp
  const mergedData = (() => {
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
        // Store using sensor id as key for merged access
        row[sensor.id] = parseFloat(d[vKey]) || 0;
      });
    });

    return Array.from(allTimestamps.values()).sort((a, b) => a.ts - b.ts);
  })();

  return { sensorData, valueKeys, mergedData, loading, error, lastUpdated };
}
