import { useSyncExternalStore } from 'react';
import { RISK_RANK } from '../lib/clinical';
import type { StreamSource } from '../stream/StreamSource';
import type {
  AlertEvent,
  ConnectionStatus,
  OpsSnapshot,
  PatientInfo,
  StreamMessage,
  VitalsReading,
} from '../types/contracts';

const HISTORY = 150; // ~2.5 min at 1 Hz per patient
const MAX_ALERTS = 120;
const RATE_WINDOW = 60; // seconds of events/sec history

export interface PatientState {
  info: PatientInfo;
  latest: VitalsReading | null;
  history: VitalsReading[];
}

export interface AlertState extends AlertEvent {
  acked: boolean;
}

export interface DashboardState {
  connection: ConnectionStatus;
  sourceKind: 'mock' | 'live';
  sourceLabel: string;
  patients: Record<string, PatientState>;
  order: string[];
  alerts: AlertState[];
  ops: OpsSnapshot | null;
  /** events/sec received by the browser, last RATE_WINDOW seconds */
  rate: number[];
  /** rolling mean of (receive time − sample time) for fresh readings */
  latencyMs: number;
  selectedId: string | null;
}

type Listener = () => void;

/**
 * Tiny external store. Stream messages are queued and applied in batches
 * every 250 ms, so React renders ~4×/s regardless of message volume.
 */
class VitalStore {
  private state: DashboardState = {
    connection: 'connecting',
    sourceKind: 'mock',
    sourceLabel: '',
    patients: {},
    order: [],
    alerts: [],
    ops: null,
    rate: [],
    latencyMs: 0,
    selectedId: null,
  };
  private listeners = new Set<Listener>();
  private queue: StreamMessage[] = [];
  private countThisSecond = 0;
  private latencySamples: number[] = [];
  private source: StreamSource | null = null;
  private timers: number[] = [];

  getState = (): DashboardState => this.state;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private set(patch: Partial<DashboardState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  attach(source: StreamSource) {
    this.detach();
    this.source = source;
    this.set({ sourceKind: source.kind, sourceLabel: source.label });
    source.connect({
      onMessage: (m) => {
        this.queue.push(m);
        this.countThisSecond++;
      },
      onStatus: (connection) => this.set({ connection }),
    });
    this.timers.push(window.setInterval(() => this.flush(), 250));
    this.timers.push(
      window.setInterval(() => {
        const rate = [...this.state.rate, this.countThisSecond].slice(-RATE_WINDOW);
        this.countThisSecond = 0;
        this.set({ rate });
      }, 1000),
    );
  }

  detach() {
    this.timers.forEach((t) => window.clearInterval(t));
    this.timers = [];
    this.source?.disconnect();
    this.source = null;
  }

  select(id: string) {
    this.set({ selectedId: id });
  }

  ack(alertId: string) {
    this.source?.send({ type: 'alert.ack', alertId, by: 'charge-nurse' });
    this.set({ alerts: this.state.alerts.map((a) => (a.id === alertId ? { ...a, acked: true } : a)) });
  }

  ackAll() {
    this.state.alerts.filter((a) => !a.acked).forEach((a) => this.source?.send({ type: 'alert.ack', alertId: a.id, by: 'charge-nurse' }));
    this.set({ alerts: this.state.alerts.map((a) => (a.acked ? a : { ...a, acked: true })) });
  }

  private flush() {
    if (this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];

    let patients = this.state.patients;
    let order = this.state.order;
    let alerts = this.state.alerts;
    let ops = this.state.ops;
    let selectedId = this.state.selectedId;
    let patientsCopied = false;
    const touched = new Map<string, VitalsReading[]>();
    const now = Date.now();

    for (const m of batch) {
      switch (m.topic) {
        case 'patients.all-list': {
          const next: Record<string, PatientState> = {};
          for (const info of m.payload) {
            const existing = patients[info.id];
            // Always take the NEW details (name, bed, diagnosis); keep the readings we already have.
            next[info.id] = existing ? { ...existing, info } : { info, latest: null, history: [] };
          }
          patients = next;
          patientsCopied = true;
          order = m.payload.map((p) => p.id);
          break;
        }
        case 'vitals.enriched': {
          const r = m.payload;
          const arr = touched.get(r.patientId) ?? [];
          arr.push(r);
          touched.set(r.patientId, arr);
          const lag = now - r.ts;
          if (lag >= 0 && lag < 2500) this.latencySamples.push(lag);
          break;
        }
        case 'alerts.events':
          alerts = [{ ...m.payload, acked: false }, ...alerts].slice(0, MAX_ALERTS);
          break;
        case 'ops.metrics':
          ops = m.payload;
          break;
      }
    }

    if (touched.size) {
      if (!patientsCopied) patients = { ...patients };
      for (const [id, readings] of touched) {
        const p = patients[id];
        if (!p) continue;
        const history = p.history.concat(readings).slice(-HISTORY);
        patients[id] = { ...p, history, latest: history[history.length - 1] ?? null };
      }
    }

    if (!selectedId && order.length) {
      // Default focus: the sickest patient on the board.
      selectedId = [...order].sort((a, b) => riskOf(patients[b]) - riskOf(patients[a]))[0] ?? null;
    }

    this.latencySamples = this.latencySamples.slice(-200);
    const latencyMs = this.latencySamples.length
      ? this.latencySamples.reduce((s, x) => s + x, 0) / this.latencySamples.length
      : this.state.latencyMs;

    this.set({ patients, order, alerts, ops, selectedId, latencyMs });
  }
}

function riskOf(p: PatientState | undefined): number {
  return p?.latest ? RISK_RANK[p.latest.risk] * 100 + p.latest.news2 : -1;
}

export const store = new VitalStore();

export function useDashboard<T>(selector: (s: DashboardState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}
