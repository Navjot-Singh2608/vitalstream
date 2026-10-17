import { news2, RISK_RANK } from '../lib/clinical';
import type {
  AlertEvent,
  AlertSeverity,
  ClientCommand,
  OpsSnapshot,
  PatientInfo,
  ServiceMetrics,
  StreamMessage,
  TopicMetrics,
  VitalKey,
  VitalsReading,
} from '../types/contracts';
import type { StreamHandlers, StreamSource } from './StreamSource';

/**
 * In-browser simulation of the whole pipeline: bedside monitors, the
 * vitals-processor (scoring), the alert-engine and the ops metrics every
 * service would publish. Emits exactly the envelopes the real gateway sends.
 */

type Vitals = Pick<VitalsReading, VitalKey | 'dbp'>;

interface Episode {
  ticksLeft: number;
  total: number;
  magnitude: number;
  kind: 'sepsis' | 'resp' | 'brady';
}

interface Sim {
  info: PatientInfo;
  base: Vitals;
  cur: Vitals;
  episode: Episode | null;
  lastRisk: VitalsReading['risk'];
}

const DEMO_PATIENTS: Array<[string, number, string, Partial<Vitals>?]> = [
  ['A. Moreau', 67, 'Post-op hip repair'],
  ['K. Osei', 54, 'Community pneumonia', { spo2: 93, rr: 20 }],
  ['L. Tremblay', 72, 'CHF exacerbation', { hr: 96 }],
  ['R. Patel', 45, 'Appendectomy'],
  ['M. Novak', 81, 'COPD', { spo2: 92, rr: 21 }],
  ['S. Kim', 38, 'DKA, resolving'],
  ['J. Okafor', 59, 'Chest pain obs.'],
  ['E. Laurent', 63, 'Cellulitis', { temp: 38.2 }],
  ['D. Singh', 70, 'Stroke rehab'],
  ['C. Rossi', 49, 'Pancreatitis', { hr: 92 }],
  ['P. Walsh', 76, 'Hip fracture'],
  ['T. Nguyen', 33, 'Asthma'],
  ['H. Bergström', 68, 'Post-op bowel resection'],
  ['F. Haddad', 57, 'Atrial fibrillation', { hr: 104 }],
  ['G. Martins', 74, 'UTI, confusion', { temp: 38.1 }],
  ['B. Adeyemi', 42, 'Sickle cell crisis', { hr: 95 }],
  ['I. Kowalski', 85, 'Fall, rib fractures', { rr: 20 }],
  ['N. Fischer', 61, 'GI bleed', { hr: 98, sbp: 108 }],
  ['O. Reyes', 29, 'Post-op lap chole'],
  ['V. Ivanova', 66, 'Pulmonary embolism', { spo2: 94, hr: 97 }],
  ['W. Chen', 53, 'Alcohol withdrawal', { hr: 100 }],
  ['Y. Dubois', 79, 'Heart failure', { spo2: 94 }],
  ['Z. Ali', 47, 'Kidney stone'],
  ['Q. Murphy', 71, 'COPD exacerbation', { spo2: 91, rr: 22 }],
];

const SERVICE_DEFS: Array<Pick<ServiceMetrics, 'name' | 'role' | 'tech' | 'instances'> & { p95: number }> = [
  { name: 'ingest-gateway', role: 'Receives monitor HL7/JSON, produces vitals.raw', tech: 'FastAPI · aiokafka', instances: 2, p95: 9 },
  { name: 'vitals-processor', role: 'Validates & scores NEWS2 → vitals.enriched', tech: 'FastAPI worker · aiokafka', instances: 3, p95: 14 },
  { name: 'alert-engine', role: 'Threshold + trend rules → alerts.events', tech: 'FastAPI worker · aiokafka', instances: 2, p95: 21 },
  { name: 'notifier', role: 'Pages nurses, writes audit log', tech: 'FastAPI worker', instances: 1, p95: 35 },
  { name: 'stream-gateway', role: 'Fans Kafka topics out to dashboards', tech: 'FastAPI · WebSocket', instances: 2, p95: 6 },
];

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;

export class MockStream implements StreamSource {
  readonly kind = 'mock' as const;
  readonly label = 'Simulated pipeline';
  private timers: number[] = [];
  private sims: Sim[] = [];
  private h: StreamHandlers | null = null;
  private cooldown = new Map<string, number>();
  private emitted = { raw: 0, alerts: 0 };
  private lag: Record<string, number> = { 'vitals.raw': 3, 'vitals.enriched': 2, 'alerts.events': 0, 'ops.metrics': 0 };
  private alertSeq = 0;
  private degradedTicks = 0;

  connect(handlers: StreamHandlers): void {
    this.h = handlers;
    handlers.onStatus('connecting');
    this.sims = DEMO_PATIENTS.map(([name, age, diagnosis, over], i) => {
      const base: Vitals = {
        hr: rand(64, 84),
        spo2: rand(96, 99),
        sbp: rand(114, 134),
        dbp: rand(68, 82),
        rr: rand(13, 17),
        temp: rand(36.5, 37.2),
        ...over,
      };
      return {
        info: { id: `P-${1001 + i}`, bed: String(i + 1).padStart(2, '0'), name, age, ward: '4 West', diagnosis },
        base,
        cur: { ...base },
        episode: null,
        lastRisk: 'stable',
      };
    });
    // Seed two patients mid-episode so the board isn't all green on load.
    this.startEpisode(this.sims[2]!, 'sepsis', 0.75);
    this.startEpisode(this.sims[9]!, 'resp', 0.5);
    this.startEpisode(this.sims[17]!, 'brady', 0.6);

    this.timers.push(
      window.setTimeout(() => {
        handlers.onStatus('open');
        this.emit({ topic: 'patients.all-list', ts: Date.now(), payload: this.sims.map((s) => s.info) });
        // Back-fill ~2 minutes of history so charts aren't empty.
        const now = Date.now();
        for (let t = 120; t >= 3; t--) for (const s of this.sims) this.step(s, now - t * 1000, true);
        this.emitted.raw = 0;
        this.timers.push(window.setInterval(() => this.tick(), 1000));
        this.timers.push(window.setInterval(() => this.publishOps(), 2000));
        this.publishOps();
      }, 400),
    );
  }

  send(cmd: ClientCommand): void {
    // A real gateway would produce this to an `alerts.acks` topic.
    console.info('[mock] command', cmd);
  }

  disconnect(): void {
    this.timers.forEach((t) => {
      window.clearInterval(t);
      window.clearTimeout(t);
    });
    this.timers = [];
    this.h?.onStatus('closed');
  }

  private emit(msg: StreamMessage) {
    this.h?.onMessage(msg);
  }

  private tick() {
    const now = Date.now();
    for (const s of this.sims) this.step(s, now - rand(15, 70), false);
  }

  private startEpisode(s: Sim, kind: Episode['kind'], magnitude: number) {
    const total = Math.round(rand(60, 150));
    s.episode = { kind, magnitude, total, ticksLeft: total };
  }

  private target(s: Sim): Vitals {
    const b = s.base;
    const e = s.episode;
    if (!e) return b;
    // Rise, plateau, recover: triangle-ish envelope over the episode.
    const p = 1 - e.ticksLeft / e.total;
    const env = Math.min(1, p * 3, (1 - p) * 2.2) * e.magnitude;
    switch (e.kind) {
      case 'sepsis':
        return { ...b, hr: b.hr + 50 * env, sbp: b.sbp - 40 * env, dbp: b.dbp - 22 * env, rr: b.rr + 11 * env, temp: b.temp + 2.2 * env, spo2: b.spo2 - 4 * env };
      case 'resp':
        return { ...b, spo2: b.spo2 - 10 * env, rr: b.rr + 14 * env, hr: b.hr + 25 * env };
      case 'brady':
        return { ...b, hr: b.hr - 34 * env, sbp: b.sbp - 25 * env, dbp: b.dbp - 12 * env };
    }
  }

  private step(s: Sim, ts: number, backfill: boolean) {
    if (s.episode) {
      if (--s.episode.ticksLeft <= 0) s.episode = null;
    } else if (Math.random() < 0.0035) {
      const kinds: Episode['kind'][] = ['sepsis', 'resp', 'brady'];
      this.startEpisode(s, kinds[Math.floor(Math.random() * kinds.length)]!, rand(0.45, 1));
    }
    const t = this.target(s);
    const c = s.cur;
    const pull = 0.12;
    c.hr = clamp(c.hr + (t.hr - c.hr) * pull + rand(-2.2, 2.2), 30, 180);
    c.spo2 = clamp(c.spo2 + (t.spo2 - c.spo2) * pull + rand(-0.5, 0.5), 78, 100);
    c.sbp = clamp(c.sbp + (t.sbp - c.sbp) * pull + rand(-2.5, 2.5), 60, 210);
    c.dbp = clamp(c.dbp + (t.dbp - c.dbp) * pull + rand(-1.5, 1.5), 35, 120);
    c.rr = clamp(c.rr + (t.rr - c.rr) * pull + rand(-0.6, 0.6), 5, 42);
    c.temp = clamp(c.temp + (t.temp - c.temp) * 0.05 + rand(-0.03, 0.03), 34, 41.5);

    const v = { hr: round(c.hr), spo2: round(c.spo2), sbp: round(c.sbp), dbp: round(c.dbp), rr: round(c.rr), temp: round(c.temp, 1) };
    const { total, risk } = news2(v);
    const reading: VitalsReading = { patientId: s.info.id, ts, ...v, news2: total, risk };
    this.emitted.raw++;
    this.emit({ topic: 'vitals.enriched', ts, payload: reading });
    if (!backfill) this.runAlertRules(s, reading);
    s.lastRisk = risk;
  }

  /** What alert-engine does: escalation + hard-threshold rules with cooldown. */
  private runAlertRules(s: Sim, r: VitalsReading) {
    const fire = (metric: AlertEvent['metric'], severity: AlertSeverity, value: number, message: string) => {
      const key = `${r.patientId}:${metric}`;
      const until = this.cooldown.get(key) ?? 0;
      if (Date.now() < until) return;
      this.cooldown.set(key, Date.now() + 45_000);
      this.emitted.alerts++;
      const alert: AlertEvent = {
        id: `AL-${++this.alertSeq}`,
        patientId: r.patientId,
        bed: s.info.bed,
        ts: Date.now(),
        severity,
        metric,
        value,
        message,
      };
      this.emit({ topic: 'alerts.events', ts: alert.ts, payload: alert });
    };

    if (RISK_RANK[r.risk] > RISK_RANK[s.lastRisk] && RISK_RANK[r.risk] >= 2) {
      fire('news2', r.risk === 'critical' ? 'critical' : 'serious', r.news2, `NEWS2 escalated to ${r.news2} (${r.risk})`);
    }
    if (r.spo2 <= 89) fire('spo2', 'critical', r.spo2, `SpO₂ ${r.spo2}% — desaturation`);
    else if (r.spo2 <= 91) fire('spo2', 'serious', r.spo2, `SpO₂ ${r.spo2}% below target`);
    if (r.hr >= 131) fire('hr', 'critical', r.hr, `Tachycardia ${r.hr} bpm`);
    else if (r.hr <= 40) fire('hr', 'critical', r.hr, `Bradycardia ${r.hr} bpm`);
    else if (r.hr >= 115) fire('hr', 'warning', r.hr, `HR trending up: ${r.hr} bpm`);
    if (r.sbp <= 90) fire('sbp', 'critical', r.sbp, `Hypotension ${r.sbp}/${r.dbp}`);
    if (r.rr >= 25) fire('rr', 'serious', r.rr, `Tachypnoea ${r.rr}/min`);
    if (r.temp >= 39.1) fire('temp', 'warning', r.temp, `Fever ${r.temp.toFixed(1)}°C`);
  }

  private publishOps() {
    const rawRate = this.emitted.raw / 2;
    const alertRate = this.emitted.alerts / 2;
    this.emitted = { raw: 0, alerts: 0 };

    // Occasionally let alert-engine get slow so lag/degraded states show up.
    if (this.degradedTicks > 0) this.degradedTicks--;
    else if (Math.random() < 0.03) this.degradedTicks = Math.round(rand(6, 14));
    const degraded = this.degradedTicks > 0;

    const walk = (k: string, target: number) => {
      const cur = this.lag[k] ?? 0;
      this.lag[k] = Math.max(0, Math.round(cur + (target - cur) * 0.35 + rand(-2, 2)));
      return this.lag[k]!;
    };

    const services: ServiceMetrics[] = SERVICE_DEFS.map((d) => {
      const slow = degraded && d.name === 'alert-engine';
      const throughput =
        d.name === 'alert-engine' ? rawRate : d.name === 'notifier' ? alertRate : d.name === 'stream-gateway' ? rawRate + alertRate + 0.5 : rawRate;
      return {
        name: d.name,
        role: d.role,
        tech: d.tech,
        instances: d.instances,
        state: slow ? 'degraded' : 'healthy',
        throughput: round(throughput * (slow ? 0.6 : 1), 1),
        p95Ms: round(d.p95 * (slow ? rand(6, 11) : rand(0.8, 1.3))),
        errorRate: round(slow ? rand(0.8, 2.5) : rand(0, 0.15), 2),
        cpu: round(slow ? rand(78, 95) : rand(12, 45)),
      };
    });

    const topics: TopicMetrics[] = [
      { name: 'vitals.raw', partitions: 6, msgsPerSec: round(rawRate, 1), consumerGroup: 'vitals-processor', consumerLag: walk('vitals.raw', 3) },
      { name: 'vitals.enriched', partitions: 6, msgsPerSec: round(rawRate, 1), consumerGroup: 'alert-engine', consumerLag: walk('vitals.enriched', degraded ? 140 : 2) },
      { name: 'alerts.events', partitions: 3, msgsPerSec: round(alertRate, 2), consumerGroup: 'notifier', consumerLag: walk('alerts.events', 0) },
      { name: 'ops.metrics', partitions: 1, msgsPerSec: 2.5, consumerGroup: 'stream-gateway', consumerLag: walk('ops.metrics', 0) },
    ];

    const snap: OpsSnapshot = { ts: Date.now(), services, topics };
    this.emit({ topic: 'ops.metrics', ts: snap.ts, payload: snap });
  }
}
