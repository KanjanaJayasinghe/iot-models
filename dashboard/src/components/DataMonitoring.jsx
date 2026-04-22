import { useState, useMemo } from 'react';
import { SENSORS, getValueKey } from '../config/sensors';
import { Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Download, Filter, Database } from 'lucide-react';

const PAGE_SIZES = [25, 50, 100, 200];

export default function DataMonitoring({ sensorData, valueKeys }) {
  const [activeSensor, setActiveSensor] = useState(SENSORS[0]?.id || '');
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState('Timestamp');
  const [sortDir, setSortDir] = useState('desc');
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [minVal, setMinVal] = useState('');
  const [maxVal, setMaxVal] = useState('');

  const sensor = SENSORS.find(s => s.id === activeSensor);
  const rawData = sensorData[activeSensor] || [];
  const vKeys = valueKeys[activeSensor] || [];
  const primaryKey = getValueKey(activeSensor, valueKeys);

  // All columns for the active sensor
  const columns = useMemo(() => {
    if (!rawData.length) return ['Timestamp'];
    const cols = ['Timestamp'];
    if (vKeys.length > 1) {
      vKeys.forEach(k => cols.push(k));
      cols.push('_magnitude');
    } else if (vKeys.length === 1) {
      cols.push(vKeys[0]);
    }
    return cols;
  }, [rawData, vKeys]);

  // Filtered + sorted data
  const filteredData = useMemo(() => {
    let result = [...rawData];

    // Search filter — matches timestamp or any value
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(row =>
        columns.some(col => String(row[col] ?? '').toLowerCase().includes(q))
      );
    }

    // Value range filter
    if (minVal !== '' || maxVal !== '') {
      const lo = minVal !== '' ? Number(minVal) : -Infinity;
      const hi = maxVal !== '' ? Number(maxVal) : Infinity;
      result = result.filter(row => {
        const v = Number(row[primaryKey]);
        return !isNaN(v) && v >= lo && v <= hi;
      });
    }

    // Sort
    result.sort((a, b) => {
      let aVal = a[sortCol];
      let bVal = b[sortCol];
      if (sortCol === 'Timestamp') {
        aVal = a.ts || 0;
        bVal = b.ts || 0;
      } else {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return result;
  }, [rawData, search, sortCol, sortDir, columns, minVal, maxVal, primaryKey]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageData = filteredData.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  };

  const handleSensorChange = (id) => {
    setActiveSensor(id);
    setCurrentPage(1);
    setSearch('');
    setMinVal('');
    setMaxVal('');
    setSortCol('Timestamp');
    setSortDir('desc');
  };

  // Export CSV
  const exportCSV = () => {
    if (!filteredData.length) return;
    const header = columns.join(',');
    const rows = filteredData.map(row => columns.map(c => {
      const v = row[c] ?? '';
      return typeof v === 'string' && v.includes(',') ? `"${v}"` : v;
    }).join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeSensor}_data.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Page Header */}
      <div style={{ marginBottom: 4 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', letterSpacing: '-0.02em' }}>
          Realtime Data Monitoring
        </h2>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
          View full historical sensor data with sorting, filtering, and export.
        </p>
      </div>

      {/* Sensor Tabs */}
      <div className="dm-sensor-tabs">
        {SENSORS.filter(s => sensorData[s.id]?.length > 0).map(s => (
          <button
            key={s.id}
            onClick={() => handleSensorChange(s.id)}
            className={`dm-tab ${activeSensor === s.id ? 'active' : ''}`}
            style={{
              '--tab-color': s.color,
            }}
          >
            <span className="dm-tab-dot" style={{ background: s.color }} />
            {s.label}
            <span className="dm-tab-count">{(sensorData[s.id] || []).length}</span>
          </button>
        ))}
      </div>

      {/* Filters Bar */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div className="dm-filters">
          {/* Search */}
          <div className="dm-search">
            <Search style={{ width: 16, height: 16, color: '#94a3b8', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search records..."
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            />
          </div>

          {/* Value Range */}
          <div className="dm-range">
            <Filter style={{ width: 14, height: 14, color: '#94a3b8', flexShrink: 0 }} />
            <input
              type="number"
              placeholder="Min"
              value={minVal}
              onChange={e => { setMinVal(e.target.value); setCurrentPage(1); }}
              style={{ width: 80 }}
            />
            <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
            <input
              type="number"
              placeholder="Max"
              value={maxVal}
              onChange={e => { setMaxVal(e.target.value); setCurrentPage(1); }}
              style={{ width: 80 }}
            />
          </div>

          {/* Page size */}
          <div className="dm-page-size">
            <span style={{ fontSize: 12, color: '#64748b' }}>Rows:</span>
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}>
              {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {/* Export */}
          <button className="dm-export" onClick={exportCSV} title="Export CSV">
            <Download style={{ width: 15, height: 15 }} />
            Export
          </button>
        </div>

        {/* Summary bar */}
        <div className="dm-summary">
          <Database style={{ width: 14, height: 14 }} />
          <span><b>{filteredData.length}</b> of {rawData.length} records</span>
          {sensor && <span style={{ marginLeft: 'auto', color: sensor.color, fontWeight: 600 }}>{sensor.label} — {sensor.unit || 'multi-axis'}</span>}
        </div>
      </div>

      {/* Table */}
      <div className="card dm-table-wrap">
        <div className="dm-table-scroll">
          <table className="dm-table">
            <thead>
              <tr>
                <th className="dm-th-row">#</th>
                {columns.map(col => (
                  <th
                    key={col}
                    onClick={() => handleSort(col)}
                    className="dm-th-sortable"
                  >
                    <span>{col === '_magnitude' ? 'Magnitude' : col}</span>
                    {sortCol === col && (
                      sortDir === 'asc'
                        ? <ChevronUp style={{ width: 14, height: 14 }} />
                        : <ChevronDown style={{ width: 14, height: 14 }} />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageData.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                    No records match the current filters.
                  </td>
                </tr>
              ) : (
                pageData.map((row, i) => (
                  <tr key={row.id || i} className="dm-tr">
                    <td className="dm-td-row">{(safePage - 1) * pageSize + i + 1}</td>
                    {columns.map(col => (
                      <td key={col}>
                        {col === 'Timestamp'
                          ? row.Timestamp || '—'
                          : typeof row[col] === 'number'
                            ? row[col].toFixed(3)
                            : row[col] ?? '—'
                        }
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="dm-pagination">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={safePage <= 1}
              className="dm-page-btn"
            >First</button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="dm-page-btn"
            >
              <ChevronLeft style={{ width: 16, height: 16 }} />
            </button>

            {/* Page numbers */}
            {(() => {
              const pages = [];
              const start = Math.max(1, safePage - 2);
              const end = Math.min(totalPages, safePage + 2);
              for (let p = start; p <= end; p++) {
                pages.push(
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p)}
                    className={`dm-page-btn ${p === safePage ? 'active' : ''}`}
                  >{p}</button>
                );
              }
              return pages;
            })()}

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="dm-page-btn"
            >
              <ChevronRight style={{ width: 16, height: 16 }} />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={safePage >= totalPages}
              className="dm-page-btn"
            >Last</button>

            <span className="dm-page-info">Page {safePage} of {totalPages}</span>
          </div>
        )}
      </div>
    </div>
  );
}
