import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AppsV1Api, CoreV1Api, Metrics, V1Pod } from '@kubernetes/client-node';
import { APPS_V1_API, CORE_V1_API, KILLABLE_APP_LABEL, METRICS_CLIENT, MONITORED_APPS } from './cluster.constants';
import { ClusterSnapshot, DeploymentInfo, KillPodResult, PodInfo } from './cluster-snapshot.interface';
import { parseCpuMillis, parseMemoryMebibytes } from './k8s-quantity.util';

interface PodUsage {
  cpuMillis: number;
  memoryMebibytes: number;
}

@Injectable()
export class ClusterService {
  private readonly logger = new Logger(ClusterService.name);

  constructor(
    @Inject(CORE_V1_API) private readonly coreApi: CoreV1Api,
    @Inject(APPS_V1_API) private readonly appsApi: AppsV1Api,
    @Inject(METRICS_CLIENT) private readonly metricsClient: Metrics,
  ) {}

  async getSnapshot(): Promise<ClusterSnapshot> {
    const namespace = process.env.CLUSTER_NAMESPACE ?? 'blackfriday';
    const [deployments, pods] = await Promise.all([
      this.readDeployments(namespace),
      this.readPods(namespace),
    ]);

    return { timestamp: new Date().toISOString(), deployments, pods };
  }

  // Escolhe e deleta um pod aleatório restrito a labelSelector: app=api — a
  // única defesa real contra deletar postgres/gateway, já que o RBAC do
  // orchestrator concede delete sobre qualquer pod do namespace
  // (negocio.md §5.1, risco residual documentado).
  async killRandomApiPod(): Promise<KillPodResult> {
    const namespace = process.env.CLUSTER_NAMESPACE ?? 'blackfriday';
    const podList = await this.coreApi.listNamespacedPod({
      namespace,
      labelSelector: `app=${KILLABLE_APP_LABEL}`,
    });

    const pods = podList.items;
    if (pods.length === 0) {
      throw new NotFoundException('Nenhum pod da api encontrado para matar');
    }

    const pod = pods[Math.floor(Math.random() * pods.length)];
    const podName = pod.metadata?.name;
    if (!podName) {
      throw new NotFoundException('Pod sorteado não possui nome');
    }

    await this.coreApi.deleteNamespacedPod({ name: podName, namespace });

    return { podName };
  }

  private async readDeployments(namespace: string): Promise<DeploymentInfo[]> {
    return Promise.all(
      MONITORED_APPS.map(async (app): Promise<DeploymentInfo> => {
        try {
          const deployment = await this.appsApi.readNamespacedDeployment({ name: app, namespace });
          return {
            name: app,
            replicas: deployment.spec?.replicas ?? 0,
            readyReplicas: deployment.status?.readyReplicas ?? 0,
          };
        } catch (erro) {
          this.logger.warn(`Falha ao ler o Deployment "${app}": ${(erro as Error).message}`);
          return { name: app, replicas: 0, readyReplicas: 0 };
        }
      }),
    );
  }

  private async readPods(namespace: string): Promise<PodInfo[]> {
    const [pods, podUsageByName] = await Promise.all([
      this.listPods(namespace),
      this.readPodUsageByName(namespace),
    ]);

    return pods.map((pod) => {
      const nome = pod.metadata?.name ?? 'desconhecido';
      const usage = podUsageByName.get(nome);
      return {
        name: nome,
        app: pod.metadata?.labels?.app ?? 'desconhecido',
        status: pod.status?.phase ?? 'Desconhecido',
        cpuMillis: usage?.cpuMillis ?? null,
        memoryMebibytes: usage?.memoryMebibytes ?? null,
      };
    });
  }

  private async listPods(namespace: string): Promise<V1Pod[]> {
    try {
      const labelSelector = `app in (${MONITORED_APPS.join(',')})`;
      const podList = await this.coreApi.listNamespacedPod({ namespace, labelSelector });
      return podList.items;
    } catch (erro) {
      // Cluster inacessível (ex: sem kubeconfig local, API server fora do ar) —
      // o snapshot ainda deve chegar ao dashboard, só sem a lista de pods,
      // em vez de derrubar a conexão WebSocket inteira (negocio.md §8).
      this.logger.warn(`Falha ao listar pods: ${(erro as Error).message}`);
      return [];
    }
  }

  private async readPodUsageByName(namespace: string): Promise<Map<string, PodUsage>> {
    const usageByName = new Map<string, PodUsage>();

    try {
      const { items } = await this.metricsClient.getPodMetrics(namespace);
      for (const item of items) {
        usageByName.set(item.metadata.name, {
          cpuMillis: this.sumContainerCpuMillis(item.containers),
          memoryMebibytes: this.sumContainerMemoryMebibytes(item.containers),
        });
      }
    } catch (erro) {
      // metrics-server pode não estar disponível (ex: rodando fora do cluster
      // durante o desenvolvimento local) — o snapshot ainda deve ser útil sem
      // CPU/memória em vez de falhar por completo (negocio.md §8).
      this.logger.warn(`metrics-server indisponível: ${(erro as Error).message}`);
    }

    return usageByName;
  }

  private sumContainerCpuMillis(containers: Array<{ usage: { cpu: string } }>): number {
    return containers.reduce((soma, container) => soma + parseCpuMillis(container.usage.cpu), 0);
  }

  private sumContainerMemoryMebibytes(containers: Array<{ usage: { memory: string } }>): number {
    return containers.reduce((soma, container) => soma + parseMemoryMebibytes(container.usage.memory), 0);
  }
}
