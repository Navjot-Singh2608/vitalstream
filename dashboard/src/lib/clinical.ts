import type { RiskLevel, VitalKey, VitalsReading } from '../types/contracts';

/**
 * Simplified NEWS2 scoring (no consciousness / supplemental O2 inputs).
 * The same rules as the risk-scorer service in the backend.
 * Not for clinical use.
 */
type Band = [max: number, score: number];

const BANDS: Record<VitalKey, Band[]> = {
  rr: [[8, 3], [11, 1], [20, 0], [24, 2], [Infinity, 3]],
  spo2: [[91, 3], [93, 2], [95, 1], [Infinity, 0]],
  sbp: [[90, 3], [100, 2], [110, 1], [219, 0], [Infinity, 3]],
  hr: [[40, 3], [50, 1], [90, 0], [110, 1], [130, 2], [Infinity, 3]],
  temp: [[35, 3], [36, 1], [38, 0], [39, 1], [Infinity, 2]],
};

export function scoreParam(key: VitalKey, value: number): number {
  for (const [max, score] of BANDS[key]) if (value <= max) return score;
  return 0;
}

export function news2(v: Pick<VitalsReading, VitalKey>): { total: number; risk: RiskLevel } {
  const keys: VitalKey[] = ['rr', 'spo2', 'sbp', 'hr', 'temp'];
  const parts = keys.map((k) => scoreParam(k, v[k]));
  const total = parts.reduce((a, b) => a + b, 0);
  const anyRed = parts.some((p) => p === 3);
  let risk: RiskLevel = 'stable';
  if (total >= 7) risk = 'critical';
  else if (total >= 5 || anyRed) risk = 'urgent';
  else if (total >= 3) risk = 'watch';
  return { total, risk };
}

export const RISK_RANK: Record<RiskLevel, number> = { stable: 0, watch: 1, urgent: 2, critical: 3 };

export interface VitalMeta {
  key: VitalKey;
  label: string;
  short: string;
  unit: string;
  normal: [number, number];
  domain: [number, number];
  decimals: number;
}

export const VITALS: Record<VitalKey, VitalMeta> = {
  hr: { key: 'hr', label: 'Heart rate', short: 'HR', unit: 'bpm', normal: [51, 90], domain: [30, 170], decimals: 0 },
  spo2: { key: 'spo2', label: 'SpO₂', short: 'SpO₂', unit: '%', normal: [96, 100], domain: [80, 100], decimals: 0 },
  sbp: { key: 'sbp', label: 'Systolic BP', short: 'BP', unit: 'mmHg', normal: [111, 140], domain: [60, 200], decimals: 0 },
  rr: { key: 'rr', label: 'Resp. rate', short: 'RR', unit: '/min', normal: [12, 20], domain: [4, 40], decimals: 0 },
  temp: { key: 'temp', label: 'Temperature', short: 'T', unit: '°C', normal: [36.1, 38], domain: [34, 41], decimals: 1 },
};

export function isAbnormal(key: VitalKey, value: number): boolean {
  return scoreParam(key, value) >= 2;
}
