import { LayoutDashboard, TrendingUp, SearchX, Shapes, GitCompareArrows, Bell, Database, Settings, Waves } from 'lucide-react';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'monitoring', label: 'Data Monitor', icon: Database },
  { id: 'forecasting', label: 'Forecasting', icon: TrendingUp },
  { id: 'anomalies', label: 'Anomalies', icon: SearchX },
  { id: 'clusters', label: 'Clusters', icon: Shapes },
  { id: 'correlation', label: 'Correlation', icon: GitCompareArrows },
  { id: 'alerts', label: 'Alerts', icon: Bell },
];

export default function Sidebar({ active, onNavigate }) {
  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Waves style={{ width: 20, height: 20, color: 'white' }} />
        </div>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', letterSpacing: '-0.3px' }}>
          AquaWatch
        </span>
      </div>

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
            <Icon style={{ width: 20, height: 20 }} />
            <span>{item.label}</span>
          </button>
        );
      })}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Bottom settings */}
      <button className="sidebar-link" onClick={() => onNavigate('settings')}>
        <Settings style={{ width: 20, height: 20 }} />
        <span>Settings</span>
      </button>
    </aside>
  );
}
