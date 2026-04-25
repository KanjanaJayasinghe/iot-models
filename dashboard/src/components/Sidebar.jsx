import { LayoutDashboard, TrendingUp, SearchX, Shapes, GitCompareArrows, Bell, Database, Info, Waves } from 'lucide-react';

const NAV = [
  { id: 'dashboard',   label: 'Dashboard',    icon: LayoutDashboard },
  { id: 'monitoring',  label: 'Data Monitor', icon: Database },
  { id: 'forecasting', label: 'Forecasting',  icon: TrendingUp },
  { id: 'anomalies',   label: 'Anomalies',    icon: SearchX },
  { id: 'clusters',    label: 'Clusters',     icon: Shapes },
  { id: 'correlation', label: 'Correlation',  icon: GitCompareArrows },
  { id: 'alerts',      label: 'Alerts',       icon: Bell },
];

export default function Sidebar({ active, onNavigate }) {
  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Waves style={{ width: 22, height: 22, color: 'white' }} />
        </div>
        <div>
          <div className="sidebar-logo-title">AquaWatch</div>
          <div className="sidebar-logo-sub">IoT Dashboard</div>
        </div>
      </div>

      <span className="sidebar-section-label">Main</span>

      {/* Nav links */}
      {NAV.map(item => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            className={`sidebar-link ${isActive ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">
              <Icon style={{ width: 18, height: 18 }} />
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}

      <div style={{ flex: 1 }} />
      <div className="sidebar-divider" />

      <span className="sidebar-section-label">System</span>
      <button
        className={`sidebar-link ${active === 'settings' ? 'active' : ''}`}
        onClick={() => onNavigate('settings')}
      >
        <span className="nav-icon">
          <Info style={{ width: 18, height: 18 }} />
        </span>
        <span>System Info</span>
      </button>
    </aside>
  );
}
