import { useEffect, useState } from 'react';
import { useDashboard } from '../store/vitalStore';

const CONN: Record<string, { label: string; tone: string }> = {
  open: { label: 'Streaming', tone: 'good' },
  connecting: { label: 'Connecting…', tone: 'warning' },
  reconnecting: { label: 'Reconnecting…', tone: 'serious' },
  closed: { label: 'Disconnected', tone: 'critical' },
};

export function TopBar() {
  const connection = useDashboard((s) => s.connection);
  const sourceLabel = useDashboard((s) => s.sourceLabel);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const c = CONN[connection] ?? CONN.closed!;

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path d="M2 12h4l2-5 4 10 3-7 2 2h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div>
          <div className="brand-name">
            VitalStream <span>Pulse</span>
          </div>
          <div className="brand-sub">Ward 4 West · Control room</div>
        </div>
      </div>

      <div className="topbar-right">
        <span className="pill" title={sourceLabel}>
          Live · FastAPI gateway
        </span>
        <span className={`pill conn tone-${c.tone}`}>
          <span className={`pulse-dot ${connection === 'open' ? 'on' : ''}`} aria-hidden />
          {c.label}
        </span>
        <time className="clock">
          {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </time>
      </div>
    </header>
  );
}
