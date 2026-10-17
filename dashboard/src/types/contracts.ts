/**
 * Wire contracts between the FastAPI stream-gateway and the dashboard.
 *
 * Every message on the WebSocket is a JSON envelope tagged with the Kafka
 * topic it came from. Keep these in sync with the Pydantic models in the
 * backend services (one schema per topic).
 *
 *   monitors -> ingest-gateway -> [vitals.raw] -> vitals-processor
 *            -> [vitals.enriched] -> alert-engine -> [alerts.events] -> notifier
 *   stream-gateway consumes vitals.enriched + alerts.events + ops.metrics
 *            and fans them out to dashboards over /ws/stream
 */

export type RiskLevel = 'stable' | 'watch' | 'urgent' | 'critical';
export type AlertSeverity = 'warning' | 'serious' | 'critical';
export type VitalKey = 'hr' | 'spo2' | 'sbp' | 'rr' | 'temp';

export interface PatientInfo {
  id: string;
  bed: string;
  name: string;
  age: number;
  ward: string;
  diagnosis: string;
}

/** Topic `vitals.enriched` — a raw reading after vitals-processor scored it. */
export interface VitalsReading {
  patientId: string;
  /** epoch ms when the bedside monitor sampled it */
  ts: number;
  hr: number;
  spo2: number;
  sbp: number;
  dbp: number;
  rr: number;
  temp: number;
  /** NEWS2-style aggregate score computed by vitals-processor */
  news2: number;
  risk: RiskLevel;
}

/** Topic `alerts.events` — produced by alert-engine. */
export interface AlertEvent {
  id: string;
  patientId: string;
  bed: string;
  ts: number;
  severity: AlertSeverity;
  metric: VitalKey | 'news2';
  value: number;
  message: string;
}

export type ServiceState = 'healthy' | 'degraded' | 'down';

export interface ServiceMetrics {
  name: string;
  role: string;
  tech: string;
  state: ServiceState;
  instances: number;
  /** messages handled per second */
  throughput: number;
  p95Ms: number;
  errorRate: number;
  cpu: number;
}

export interface TopicMetrics {
  name: string;
  partitions: number;
  msgsPerSec: number;
  consumerGroup: string;
  consumerLag: number;
}

/** Topic `ops.metrics` — periodic snapshot published by each service. */
export interface OpsSnapshot {
  ts: number;
  services: ServiceMetrics[];
  topics: TopicMetrics[];
}

/** Server -> client envelopes (discriminated on `topic`). */
export type StreamMessage =
  | { topic: 'patients.all-list'; ts: number; payload: PatientInfo[] }
  | { topic: 'vitals.enriched'; ts: number; payload: VitalsReading }
  | { topic: 'alerts.events'; ts: number; payload: AlertEvent }
  | { topic: 'ops.metrics'; ts: number; payload: OpsSnapshot };

/** Client -> server commands. */
export type ClientCommand = { type: 'alert.ack'; alertId: string; by: string };

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

const TOPICS = new Set<StreamMessage['topic']>([
  'patients.all-list',
  'vitals.enriched',
  'alerts.events',
  'ops.metrics',
]);

/** Cheap runtime guard for messages arriving over the wire. */
export function isStreamMessage(value: unknown): value is StreamMessage {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { topic?: unknown; payload?: unknown };
  return typeof v.topic === 'string' && TOPICS.has(v.topic as StreamMessage['topic']) && v.payload != null;
}
