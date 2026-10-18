import { isStreamMessage, type ClientCommand } from "../types/contracts";
import type { StreamHandlers, StreamSource } from "./StreamSource";

/**
 * Connects to the FastAPI stream-gateway (`/ws/stream`). The gateway consumes
 * Kafka with aiokafka and forwards each record as a JSON envelope.
 * Reconnects with capped exponential backoff.
 */
export class WebSocketStream implements StreamSource {
  readonly kind = "live" as const;
  readonly label: string;
  private ws: WebSocket | null = null;
  private handlers: StreamHandlers | null = null;
  private attempt = 0;
  private retryTimer: number | undefined;
  private closedByUser = false;

  constructor(private readonly url: string) {
    this.label = url;
  }

  connect(handlers: StreamHandlers): void {
    this.handlers = handlers;
    this.closedByUser = false;
    this.open();
  }

  private open(): void {
    const h = this.handlers;
    if (!h) return;
    h.onStatus(this.attempt === 0 ? "connecting" : "reconnecting");
    const ws = new WebSocket(this.url);
    this.ws = ws;

    console.info("[stream] connecting to", this.url);
    ws.onopen = () => {
      this.attempt = 0;
      console.info("[stream] connected");
      h.onStatus("open");
    };
    ws.onmessage = (ev: MessageEvent<string>) => {
      try {
        const data: unknown = JSON.parse(ev.data);
        // The gateway may batch: accept a single envelope or an array.
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (isStreamMessage(item)) h.onMessage(item);
          else
            console.warn("[stream] ignored message with unknown topic", item);
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = (ev) => {
      this.ws = null;
      console.warn(
        `[stream] closed (code ${ev.code}); is stream-gateway running on ${this.url}?`,
      );
      if (this.closedByUser) {
        h.onStatus("closed");
        return;
      }
      const delay = Math.min(15000, 500 * 2 ** this.attempt++);
      h.onStatus("reconnecting");
      this.retryTimer = window.setTimeout(() => this.open(), delay);
    };
    ws.onerror = () => ws.close();
  }

  send(cmd: ClientCommand): void {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify(cmd));
  }

  disconnect(): void {
    this.closedByUser = true;
    window.clearTimeout(this.retryTimer);
    this.ws?.close();
  }
}
