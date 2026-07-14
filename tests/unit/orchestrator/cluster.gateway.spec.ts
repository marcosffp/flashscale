import { ClusterGateway } from '../../../services/orchestrator/src/cluster/cluster.gateway';
import { ClusterService } from '../../../services/orchestrator/src/cluster/cluster.service';
import { ClusterSnapshot } from '../../../services/orchestrator/src/cluster/cluster-snapshot.interface';

function criarSnapshot(): ClusterSnapshot {
  return { timestamp: '2026-07-13T00:00:00.000Z', deployments: [], pods: [] };
}

function criarFakeClient(readyState = 1 /* OPEN */) {
  return { readyState, OPEN: 1, send: jest.fn() };
}

describe('ClusterGateway (negocio.md §8 — WebSocket em tempo real do cluster)', () => {
  let clusterService: jest.Mocked<Pick<ClusterService, 'getSnapshot'>>;
  let gateway: ClusterGateway;

  beforeEach(() => {
    jest.useFakeTimers();
    clusterService = { getSnapshot: jest.fn().mockResolvedValue(criarSnapshot()) };
    gateway = new ClusterGateway(clusterService as unknown as ClusterService);
  });

  afterEach(() => {
    gateway.onModuleDestroy();
    jest.useRealTimers();
  });

  it('envia um snapshot imediato assim que um client conecta', async () => {
    const client = criarFakeClient();

    await gateway.handleConnection(client as any);

    expect(clusterService.getSnapshot).toHaveBeenCalledTimes(1);
    expect(client.send).toHaveBeenCalledWith(JSON.stringify(criarSnapshot()));
  });

  it('faz broadcast periódico do snapshot pra todos os clients conectados', async () => {
    const clienteAberto = criarFakeClient(1);
    const clienteFechado = criarFakeClient(3 /* CLOSED */);
    gateway.server = { clients: new Set([clienteAberto, clienteFechado]) } as any;

    gateway.afterInit();
    await jest.advanceTimersByTimeAsync(2000);

    expect(clienteAberto.send).toHaveBeenCalledWith(JSON.stringify(criarSnapshot()));
    expect(clienteFechado.send).not.toHaveBeenCalled();
  });

  it('para de fazer polling depois que o módulo é destruído', async () => {
    gateway.server = { clients: new Set() } as any;
    gateway.afterInit();

    gateway.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(10000);

    expect(clusterService.getSnapshot).not.toHaveBeenCalled();
  });
});
