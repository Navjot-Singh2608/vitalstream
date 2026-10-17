import { useDashboard } from '../store/vitalStore';

/** Three summary cards: how many patients, how many are in danger, how many alerts. */
export function KpiStrip() {
  const patients = useDashboard((s) => s.patients);
  const alerts = useDashboard((s) => s.alerts);

  const list = Object.values(patients);
  const critical = list.filter((p) => p.latest?.risk === 'critical').length;
  const urgent = list.filter((p) => p.latest?.risk === 'urgent').length;
  const openAlerts = alerts.filter((a) => !a.acked);
  const openCritical = openAlerts.filter((a) => a.severity === 'critical').length;

  return (
    <section className="kpis" aria-label="Summary">
      <div className="kpi">
        <div className="kpi-label">Total patients</div>
        <div className="kpi-value">{list.length}</div>
        <div className="kpi-foot">on the ward</div>
      </div>

      <div className={`kpi ${critical ? 'kpi-critical' : urgent ? 'kpi-serious' : ''}`}>
        <div className="kpi-label">Critical / urgent</div>
        <div className="kpi-value">
          <span className={critical ? 'txt-critical' : ''}>{critical}</span>
          <span className="kpi-sep">/</span>
          <span className={urgent ? 'txt-serious' : ''}>{urgent}</span>
        </div>
        <div className="kpi-foot">by NEWS2 risk score</div>
      </div>

      <div className={`kpi ${openCritical ? 'kpi-critical' : ''}`}>
        <div className="kpi-label">Alerts</div>
        <div className="kpi-value">{openAlerts.length}</div>
        <div className="kpi-foot">{openCritical ? `${openCritical} critical, not yet acknowledged` : 'none critical'}</div>
      </div>
    </section>
  );
}
