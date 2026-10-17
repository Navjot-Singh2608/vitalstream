import type { AlertSeverity, RiskLevel, ServiceState } from '../types/contracts';

/** Status colors never carry meaning alone: every badge has an icon + label. */
const RISK: Record<RiskLevel, { label: string; icon: string; tone: string }> = {
  stable: { label: 'Stable', icon: '✓', tone: 'good' },
  watch: { label: 'Watch', icon: '!', tone: 'warning' },
  urgent: { label: 'Urgent', icon: '▲', tone: 'serious' },
  critical: { label: 'Critical', icon: '✕', tone: 'critical' },
};

const SEVERITY: Record<AlertSeverity, { label: string; icon: string; tone: string }> = {
  warning: { label: 'Warning', icon: '!', tone: 'warning' },
  serious: { label: 'Serious', icon: '▲', tone: 'serious' },
  critical: { label: 'Critical', icon: '✕', tone: 'critical' },
};

const SERVICE: Record<ServiceState, { label: string; icon: string; tone: string }> = {
  healthy: { label: 'Healthy', icon: '✓', tone: 'good' },
  degraded: { label: 'Degraded', icon: '▲', tone: 'serious' },
  down: { label: 'Down', icon: '✕', tone: 'critical' },
};

export const riskTone = (r: RiskLevel) => RISK[r].tone;
export const severityTone = (s: AlertSeverity) => SEVERITY[s].tone;

function Badge({ meta, compact }: { meta: { label: string; icon: string; tone: string }; compact?: boolean }) {
  return (
    <span className={`badge tone-${meta.tone}`}>
      <span className="badge-icon" aria-hidden>
        {meta.icon}
      </span>
      {!compact && meta.label}
      {compact && <span className="sr-only">{meta.label}</span>}
    </span>
  );
}

export const RiskBadge = ({ risk, compact }: { risk: RiskLevel; compact?: boolean }) => <Badge meta={RISK[risk]} compact={compact} />;
export const SeverityBadge = ({ severity }: { severity: AlertSeverity }) => <Badge meta={SEVERITY[severity]} />;
export const ServiceBadge = ({ state }: { state: ServiceState }) => <Badge meta={SERVICE[state]} />;
