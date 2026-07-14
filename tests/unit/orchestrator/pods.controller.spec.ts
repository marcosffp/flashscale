import { PodsController } from '../../../services/orchestrator/src/cluster/pods.controller';
import { ClusterService } from '../../../services/orchestrator/src/cluster/cluster.service';

describe('PodsController (negocio.md §5.1 — botão "matar pod")', () => {
  it('delega a POST /pods/kill pro ClusterService e retorna o pod deletado', async () => {
    const clusterService = {
      killRandomApiPod: jest.fn().mockResolvedValue({ podName: 'api-abc123' }),
    } as unknown as jest.Mocked<Pick<ClusterService, 'killRandomApiPod'>>;
    const controller = new PodsController(clusterService as unknown as ClusterService);

    const resultado = await controller.matar();

    expect(clusterService.killRandomApiPod).toHaveBeenCalledTimes(1);
    expect(resultado).toEqual({ podName: 'api-abc123' });
  });
});
