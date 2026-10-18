import type { StreamSource } from "./StreamSource";
import { WebSocketStream } from "./WebSocketStream";

/** Where the stream-gateway WebSocket lives. Set VITE_STREAM_URL in dashboard/.env to change it. */
const DEFAULT_URL = "ws://localhost:8000/ws/stream";

/** The dashboard always gets its data live from the backend (stream-gateway). */
export function createStream(): StreamSource {
  const url = import.meta.env.VITE_STREAM_URL?.trim() || DEFAULT_URL;
  return new WebSocketStream(url);
}
