# VitalStream Pulse — control-room dashboard

React 18 + TypeScript (strict) + Vite. Dark, single-screen control room for a
ward's live patient vitals, plus a view of the Kafka / FastAPI pipeline that
feeds it and **PulseBot**, a small assistant that answers questions about the
live board.

```bash
cd dashboard
npm install
npm run dev        # http://localhost:5173  (runs on the simulated stream)
npm run build      # typecheck + production build
```

## Screen, top to bottom

1. **Top bar**: brand, stream source (simulated / live), connection state, clock.
2. **KPI strip**: patients monitored, critical/urgent, open alerts, events/sec,
   sample-to-screen latency, max Kafka consumer lag.
3. **Ward board + alert feed**: one card per bed (HR, SpO₂, BP, RR, T, NEWS2,
   1-min HR sparkline), sortable by risk or bed. The alert feed has filters and acknowledge buttons.
4. **Patient focus**: 2-minute live charts (HR, SpO₂, BP, RR) with the normal
   range shaded and a hover crosshair.
5. **Pipeline**: every microservice and topic with throughput, p95, error rate,
   partitions and consumer lag, from `ops.metrics`.
6. **PulseBot**: the floating button at the bottom right.

## Microservice architecture this UI expects

```
bedside monitors ─HTTP─▶ ingest-gateway (FastAPI) ─▶ [vitals.raw]
   ─▶ vitals-processor (aiokafka worker, NEWS2 scoring) ─▶ [vitals.enriched]
   ─▶ alert-engine (rules) ─▶ [alerts.events] ─▶ notifier
every service ─▶ [ops.metrics]

stream-gateway (FastAPI + WebSocket) consumes vitals.enriched, alerts.events, ops.metrics
   ─WS /ws/stream─▶ this dashboard
```

## Code map

| Path | What it does |
|---|---|
| `src/types/contracts.ts` | Wire contracts, one per topic. Mirror these as Pydantic models in FastAPI. |
| `src/stream/StreamSource.ts` | The interface both data sources implement |
| `src/stream/MockStream.ts` | In-browser simulation of the whole pipeline (episodes, alert rules, ops metrics) |
| `src/stream/WebSocketStream.ts` | Real client for the FastAPI gateway, with auto-reconnect and backoff |
| `src/store/vitalStore.ts` | External store with batched updates (4 renders/s at any message rate) |
| `src/lib/clinical.ts` | Simplified NEWS2 scoring and vital ranges |
| `src/lib/botBrain.ts` | PulseBot's rule-based answers. Replace with a `/bot/ask` call later. |
| `src/components/*` | TopBar, KpiStrip, PatientGrid, AlertFeed, PatientDetail, LiveChart, PipelineView, PulseBot |

## Going live

Copy `.env.example` to `.env` and set:

```
VITE_STREAM_URL=ws://localhost:8000/ws/stream
```

The gateway sends JSON envelopes (a single envelope or an array of them):

```json
{ "topic": "vitals.enriched", "ts": 1760000000000, "payload": { "patientId": "P-1001", "hr": 88, "...": "..." } }
```

On connect it should first send `patients.all-list`. The dashboard sends
`{ "type": "alert.ack", "alertId": "...", "by": "..." }` back over the same socket.

Demo data only. The NEWS2 here is simplified. Not for clinical use.
