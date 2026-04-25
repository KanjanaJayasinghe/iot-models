import { useState } from 'react';
import { Calendar, RefreshCw, Clock } from 'lucide-react';

// Preset quick-range options
const PRESETS = [
  { label: 'Today',    days: 0 },
  { label: 'Last 7d',  days: 7 },
  { label: 'Last 30d', days: 30 },
  { label: 'Last 90d', days: 90 },
];

function toInputDate(d) {
  // Returns "YYYY-MM-DD" local date string for <input type="date">
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(d) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function endOfDay(d) {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

export default function DateRangeFilter({ dateRange, onChange }) {
  const [open, setOpen] = useState(false);
  const [startVal, setStartVal] = useState('');
  const [endVal, setEndVal] = useState('');

  const isLive = !dateRange;

  function applyPreset(days) {
    const end = endOfDay(new Date());
    let start;
    if (days === 0) {
      start = startOfDay(new Date());
    } else {
      start = startOfDay(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
    }
    setStartVal(toInputDate(start));
    setEndVal(toInputDate(end));
    onChange({ start, end });
    setOpen(false);
  }

  function applyCustom() {
    if (!startVal || !endVal) return;
    const start = startOfDay(new Date(startVal));
    const end = endOfDay(new Date(endVal));
    if (start > end) return;
    onChange({ start, end });
    setOpen(false);
  }

  function resetToLive() {
    setStartVal('');
    setEndVal('');
    onChange(null);
    setOpen(false);
  }

  const rangeLabel = isLive
    ? null
    : `${toInputDate(dateRange.start)} → ${toInputDate(dateRange.end)}`;

  return (
    <div style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 14px',
          borderRadius: 10,
          border: isLive ? '1.5px solid var(--border)' : '1.5px solid #2563eb',
          background: isLive ? 'white' : '#eff6ff',
          color: isLive ? 'var(--text-muted)' : '#2563eb',
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'all 0.15s',
        }}
      >
        {isLive ? (
          <>
            <Clock size={14} />
            Live View
          </>
        ) : (
          <>
            <Calendar size={14} />
            {rangeLabel}
          </>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 999,
            background: 'white',
            borderRadius: 14,
            border: '1.5px solid var(--border)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.10)',
            padding: 16,
            width: 280,
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Quick Range</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.days)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 8,
                  border: '1.5px solid var(--border)',
                  background: '#f8fafc',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Custom Range</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: 3 }}>Start</label>
              <input
                type="date"
                value={startVal}
                onChange={e => setStartVal(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 12, outline: 'none' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block', marginBottom: 3 }}>End</label>
              <input
                type="date"
                value={endVal}
                onChange={e => setEndVal(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 12, outline: 'none' }}
              />
            </div>
          </div>
          <button
            onClick={applyCustom}
            disabled={!startVal || !endVal}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: 9,
              border: 'none',
              background: (!startVal || !endVal) ? '#e2e8f0' : 'linear-gradient(135deg,#2563eb,#0891b2)',
              color: (!startVal || !endVal) ? '#94a3b8' : 'white',
              fontWeight: 700,
              fontSize: 13,
              cursor: (!startVal || !endVal) ? 'default' : 'pointer',
              marginBottom: 8,
            }}
          >
            Apply Range
          </button>
          {!isLive && (
            <button
              onClick={resetToLive}
              style={{
                width: '100%',
                padding: '7px',
                borderRadius: 9,
                border: '1.5px solid var(--border)',
                background: 'white',
                color: 'var(--text-muted)',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
              }}
            >
              <RefreshCw size={12} />
              Back to Live View
            </button>
          )}
        </div>
      )}

      {/* Click-outside overlay */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 998 }}
        />
      )}
    </div>
  );
}
