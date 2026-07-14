type Listener = (event: unknown) => void;

// Test double: jsdom não implementa WebSocket, e o hook real precisa ser
// exercitado sem uma conexão de rede de verdade.
export class FakeWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = 0;
  onopen: Listener | null = null;
  onmessage: Listener | null = null;
  onclose: Listener | null = null;
  onerror: Listener | null = null;
  closeCalls = 0;

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  emitOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({});
  }

  emitMessage(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  close(): void {
    this.closeCalls += 1;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({});
  }

  static reset(): void {
    FakeWebSocket.instances = [];
  }

  static get latest(): FakeWebSocket {
    const instance = FakeWebSocket.instances.at(-1);
    if (!instance) {
      throw new Error('nenhuma instância de FakeWebSocket foi criada');
    }
    return instance;
  }
}
