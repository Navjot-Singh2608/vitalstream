import { MockStream } from './MockStream';
import type { StreamSource } from './StreamSource';
import { WebSocketStream } from './WebSocketStream';

/** VITE_STREAM_URL set -> live FastAPI gateway; otherwise the simulator. */
export function createStream(): StreamSource {
  const url = import.meta.env.VITE_STREAM_URL?.trim();
  if (!url) console.info('[stream] VITE_STREAM_URL not set in dashboard/.env: using simulated data');
  return url ? new WebSocketStream(url) : new MockStream();
}
