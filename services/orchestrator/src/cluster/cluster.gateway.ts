import { OnModuleDestroy } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { WebSocket, Server as WsServer } from 'ws';
import { ClusterService } from './cluster.service';

// Intervalo do broadcast pro dashboard (negocio.md §8 — "atualizado por evento,
// não por polling" refere-se ao client; aqui, do lado do orchestrator, é um
// polling curto contra o cluster real, cujo resultado é então empurrado por evento.
const POLL_INTERVAL_MS = 2000;

@WebSocketGateway()
export class ClusterGateway implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy {
  @WebSocketServer() server!: WsServer;

  private pollInterval?: ReturnType<typeof setInterval>;

  constructor(private readonly clusterService: ClusterService) {}

  afterInit(): void {
    this.pollInterval = setInterval(() => {
      void this.broadcastSnapshot();
    }, POLL_INTERVAL_MS);
  }

  async handleConnection(client: WebSocket): Promise<void> {
    const snapshot = await this.clusterService.getSnapshot();
    client.send(JSON.stringify(snapshot));
  }

  onModuleDestroy(): void {
    clearInterval(this.pollInterval);
  }

  private async broadcastSnapshot(): Promise<void> {
    const snapshot = await this.clusterService.getSnapshot();
    const payload = JSON.stringify(snapshot);

    this.server.clients.forEach((client) => {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    });
  }
}
