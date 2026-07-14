import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TopologyView } from './TopologyView';
import type { DeploymentInfo, PodInfo } from '../types/cluster-snapshot';

const deployments: DeploymentInfo[] = [
  { name: 'gateway', replicas: 2, readyReplicas: 2 },
  { name: 'api', replicas: 3, readyReplicas: 3 },
  { name: 'orchestrator', replicas: 0, readyReplicas: 0 },
];

const pods: PodInfo[] = [
  { name: 'gateway-abc', app: 'gateway', status: 'Running', cpuMillis: 5, memoryMebibytes: 30 },
  { name: 'api-def', app: 'api', status: 'Running', cpuMillis: 10, memoryMebibytes: 40 },
  { name: 'api-ghi', app: 'api', status: 'Pending', cpuMillis: null, memoryMebibytes: null },
];

describe('TopologyView (visão em fluxo: gateway → api → orchestrator)', () => {
  it('mostra um nó com rótulo amigável para cada deployment conhecido', () => {
    render(<TopologyView deployments={deployments} pods={pods} />);

    expect(screen.getByText('Gateway')).toBeInTheDocument();
    expect(screen.getByText('API')).toBeInTheDocument();
    expect(screen.getByText('Orchestrator')).toBeInTheDocument();
  });

  it('representa cada pod como um indicador visual (dot), sem expor o nome do pod como texto', () => {
    render(<TopologyView deployments={deployments} pods={pods} />);

    expect(screen.getByTitle(/api-def/)).toBeInTheDocument();
    expect(screen.queryByText('api-def')).not.toBeInTheDocument();
  });

  it('mostra um indicador vazio para um deployment sem pods em execução', () => {
    render(<TopologyView deployments={deployments} pods={pods} />);

    expect(screen.getByTitle(/nenhum pod em execução/i)).toBeInTheDocument();
  });

  it('rotula o conector entre gateway e api como "load balancing"', () => {
    render(<TopologyView deployments={deployments} pods={pods} />);

    expect(screen.getByText(/load balancing/i)).toBeInTheDocument();
  });
});
