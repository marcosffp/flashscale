// Espelha services/orchestrator/src/cluster/cluster-snapshot.interface.ts — o
// contrato trafega só como JSON por WebSocket, então o tipo é duplicado aqui
// em vez de importado (dashboard e orchestrator são projetos independentes).
export interface DeploymentInfo {
  name: string;
  replicas: number;
  readyReplicas: number;
}

export interface PodInfo {
  name: string;
  app: string;
  status: string;
  cpuMillis: number | null;
  memoryMebibytes: number | null;
}

export interface ClusterSnapshot {
  timestamp: string;
  deployments: DeploymentInfo[];
  pods: PodInfo[];
}
