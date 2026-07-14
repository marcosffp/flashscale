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

export interface KillPodResult {
  podName: string;
}
