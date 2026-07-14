import { Module } from '@nestjs/common';
import { AppsV1Api, CoreV1Api, KubeConfig, Metrics } from '@kubernetes/client-node';
import { APPS_V1_API, CORE_V1_API, KUBE_CONFIG, METRICS_CLIENT } from './cluster.constants';
import { ClusterGateway } from './cluster.gateway';
import { ClusterService } from './cluster.service';
import { PodsController } from './pods.controller';

// Fora do cluster (dev local, apontando pro Minikube já subido na etapa 4) usa o
// kubeconfig padrão do usuário; dentro do cluster (quando o orchestrator rodar
// como pod) usa o ServiceAccount montado automaticamente pelo Kubernetes.
function buildKubeConfig(): KubeConfig {
  const kubeConfig = new KubeConfig();
  if (process.env.KUBERNETES_SERVICE_HOST) {
    kubeConfig.loadFromCluster();
  } else {
    kubeConfig.loadFromDefault();
  }
  return kubeConfig;
}

@Module({
  controllers: [PodsController],
  providers: [
    ClusterService,
    ClusterGateway,
    { provide: KUBE_CONFIG, useFactory: buildKubeConfig },
    {
      provide: CORE_V1_API,
      useFactory: (kubeConfig: KubeConfig) => kubeConfig.makeApiClient(CoreV1Api),
      inject: [KUBE_CONFIG],
    },
    {
      provide: APPS_V1_API,
      useFactory: (kubeConfig: KubeConfig) => kubeConfig.makeApiClient(AppsV1Api),
      inject: [KUBE_CONFIG],
    },
    {
      provide: METRICS_CLIENT,
      useFactory: (kubeConfig: KubeConfig) => new Metrics(kubeConfig),
      inject: [KUBE_CONFIG],
    },
  ],
})
export class ClusterModule {}
