import type { ClientCommand, ConnectionStatus, StreamMessage } from '../types/contracts';

export interface StreamHandlers {
  onMessage: (msg: StreamMessage) => void;
  onStatus: (status: ConnectionStatus) => void;
}

/** Anything that can feed the dashboard: the simulator or the real gateway. */
export interface StreamSource {
  readonly kind: 'mock' | 'live';
  readonly label: string;
  connect(handlers: StreamHandlers): void;
  send(cmd: ClientCommand): void;
  disconnect(): void;
}
