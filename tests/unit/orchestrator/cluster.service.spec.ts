import { NotFoundException } from '@nestjs/common';
import { AppsV1Api, CoreV1Api, Metrics } from '@kubernetes/client-node';
import { ClusterService } from '../../../services/orchestrator/src/cluster/cluster.service';

function criarMockDeployment(replicas: number, readyReplicas: number) {
  return { spec: { replicas }, status: { readyReplicas } };
}

describe('ClusterService (negocio.md §8 — réplicas, CPU/memória e status de pods)', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, CLUSTER_NAMESPACE: 'blackfriday' };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  function criarService(overrides?: {
    appsApi?: Partial<AppsV1Api>;
    coreApi?: Partial<CoreV1Api>;
    metricsClient?: Partial<Metrics>;
  }) {
    const appsApi = {
      readNamespacedDeployment: jest.fn().mockResolvedValue(criarMockDeployment(2, 2)),
      ...overrides?.appsApi,
    } as unknown as AppsV1Api;

    const coreApi = {
      listNamespacedPod: jest.fn().mockResolvedValue({ items: [] }),
      deleteNamespacedPod: jest.fn().mockResolvedValue(undefined),
      ...overrides?.coreApi,
    } as unknown as CoreV1Api;

    const metricsClient = {
      getPodMetrics: jest.fn().mockResolvedValue({ items: [] }),
      ...overrides?.metricsClient,
    } as unknown as Metrics;

    const service = new ClusterService(coreApi, appsApi, metricsClient);
    return { service, appsApi, coreApi, metricsClient };
  }

  it('lê réplicas atuais e prontas de cada Deployment monitorado (gateway, api, orchestrator)', async () => {
    const { service, appsApi } = criarService();

    const snapshot = await service.getSnapshot();

    expect(appsApi.readNamespacedDeployment).toHaveBeenCalledWith({ name: 'gateway', namespace: 'blackfriday' });
    expect(appsApi.readNamespacedDeployment).toHaveBeenCalledWith({ name: 'api', namespace: 'blackfriday' });
    expect(appsApi.readNamespacedDeployment).toHaveBeenCalledWith({ name: 'orchestrator', namespace: 'blackfriday' });
    expect(snapshot.deployments).toEqual(
      expect.arrayContaining([
        { name: 'gateway', replicas: 2, readyReplicas: 2 },
        { name: 'api', replicas: 2, readyReplicas: 2 },
        { name: 'orchestrator', replicas: 2, readyReplicas: 2 },
      ]),
    );
  });

  it('não derruba o snapshot se um Deployment não puder ser lido (ex: ainda não existe no cluster)', async () => {
    const { service } = criarService({
      appsApi: {
        readNamespacedDeployment: jest.fn().mockRejectedValue(new Error('404 not found')),
      },
    });

    const snapshot = await service.getSnapshot();

    expect(snapshot.deployments).toEqual(
      expect.arrayContaining([{ name: 'gateway', replicas: 0, readyReplicas: 0 }]),
    );
  });

  it('lista pods vivos com nome, app e status', async () => {
    const { service, coreApi } = criarService({
      coreApi: {
        listNamespacedPod: jest.fn().mockResolvedValue({
          items: [
            { metadata: { name: 'api-abc', labels: { app: 'api' } }, status: { phase: 'Running' } },
            { metadata: { name: 'api-def', labels: { app: 'api' } }, status: { phase: 'Pending' } },
          ],
        }),
      },
    });

    const snapshot = await service.getSnapshot();

    expect(coreApi.listNamespacedPod).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: 'blackfriday' }),
    );
    expect(snapshot.pods).toEqual([
      { name: 'api-abc', app: 'api', status: 'Running', cpuMillis: null, memoryMebibytes: null },
      { name: 'api-def', app: 'api', status: 'Pending', cpuMillis: null, memoryMebibytes: null },
    ]);
  });

  it('funde CPU/memória do metrics-server com o pod correspondente', async () => {
    const { service } = criarService({
      coreApi: {
        listNamespacedPod: jest.fn().mockResolvedValue({
          items: [{ metadata: { name: 'api-abc', labels: { app: 'api' } }, status: { phase: 'Running' } }],
        }),
      },
      metricsClient: {
        getPodMetrics: jest.fn().mockResolvedValue({
          items: [
            {
              metadata: { name: 'api-abc' },
              containers: [{ name: 'api', usage: { cpu: '250m', memory: '128Mi' } }],
            },
          ],
        }),
      },
    });

    const snapshot = await service.getSnapshot();

    expect(snapshot.pods).toEqual([
      { name: 'api-abc', app: 'api', status: 'Running', cpuMillis: 250, memoryMebibytes: 128 },
    ]);
  });

  it('não derruba o snapshot se o cluster estiver inacessível ao listar pods (ex: sem kubeconfig local)', async () => {
    const { service } = criarService({
      coreApi: {
        listNamespacedPod: jest.fn().mockRejectedValue(new Error('conexão recusada')),
      },
    });

    const snapshot = await service.getSnapshot();

    expect(snapshot.pods).toEqual([]);
  });

  it('não derruba o snapshot se o metrics-server estiver indisponível', async () => {
    const { service } = criarService({
      coreApi: {
        listNamespacedPod: jest.fn().mockResolvedValue({
          items: [{ metadata: { name: 'api-abc', labels: { app: 'api' } }, status: { phase: 'Running' } }],
        }),
      },
      metricsClient: {
        getPodMetrics: jest.fn().mockRejectedValue(new Error('metrics-server indisponível')),
      },
    });

    const snapshot = await service.getSnapshot();

    expect(snapshot.pods).toEqual([
      { name: 'api-abc', app: 'api', status: 'Running', cpuMillis: null, memoryMebibytes: null },
    ]);
  });

  describe('killRandomApiPod (negocio.md §5.1 — botão "matar pod", nunca postgres/gateway)', () => {
    it('lista pods filtrando por labelSelector app=api antes de escolher um pra matar', async () => {
      const { service, coreApi } = criarService({
        coreApi: {
          listNamespacedPod: jest.fn().mockResolvedValue({
            items: [{ metadata: { name: 'api-abc', labels: { app: 'api' } } }],
          }),
        },
      });

      await service.killRandomApiPod();

      expect(coreApi.listNamespacedPod).toHaveBeenCalledWith({
        namespace: 'blackfriday',
        labelSelector: 'app=api',
      });
    });

    it('deleta o pod escolhido e retorna o nome dele', async () => {
      const { service, coreApi } = criarService({
        coreApi: {
          listNamespacedPod: jest.fn().mockResolvedValue({
            items: [{ metadata: { name: 'api-abc', labels: { app: 'api' } } }],
          }),
        },
      });

      const resultado = await service.killRandomApiPod();

      expect(coreApi.deleteNamespacedPod).toHaveBeenCalledWith({
        name: 'api-abc',
        namespace: 'blackfriday',
      });
      expect(resultado).toEqual({ podName: 'api-abc' });
    });

    it('escolhe aleatoriamente entre os pods retornados, nunca um pod fora do filtro app=api', async () => {
      const { service, coreApi } = criarService({
        coreApi: {
          listNamespacedPod: jest.fn().mockResolvedValue({
            items: [
              { metadata: { name: 'api-1', labels: { app: 'api' } } },
              { metadata: { name: 'api-2', labels: { app: 'api' } } },
            ],
          }),
        },
      });
      jest.spyOn(Math, 'random').mockReturnValue(0.9);

      const resultado = await service.killRandomApiPod();

      expect(resultado).toEqual({ podName: 'api-2' });
      expect(coreApi.deleteNamespacedPod).toHaveBeenCalledWith({
        name: 'api-2',
        namespace: 'blackfriday',
      });

      jest.spyOn(Math, 'random').mockRestore();
    });

    it('lança NotFoundException se nenhum pod da api estiver rodando', async () => {
      const { service, coreApi } = criarService({
        coreApi: {
          listNamespacedPod: jest.fn().mockResolvedValue({ items: [] }),
        },
      });

      await expect(service.killRandomApiPod()).rejects.toThrow(NotFoundException);
      expect(coreApi.deleteNamespacedPod).not.toHaveBeenCalled();
    });
  });
});
