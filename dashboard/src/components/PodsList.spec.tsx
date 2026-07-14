import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PodsList } from './PodsList';
import type { PodInfo } from '../types/cluster-snapshot';

describe('PodsList', () => {
  it('lista nome, app, status, cpu e memória de cada pod', () => {
    const pods: PodInfo[] = [
      { name: 'api-abc123', app: 'api', status: 'Running', cpuMillis: 120, memoryMebibytes: 256 },
    ];

    render(<PodsList pods={pods} />);

    expect(screen.getByText('api-abc123')).toBeInTheDocument();
    expect(screen.getByText('api')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('120m')).toBeInTheDocument();
    expect(screen.getByText('256Mi')).toBeInTheDocument();
  });

  it('mostra um traço quando cpu ou memória ainda não foram lidos do metrics-server', () => {
    const pods: PodInfo[] = [
      { name: 'orchestrator-xyz', app: 'orchestrator', status: 'Pending', cpuMillis: null, memoryMebibytes: null },
    ];

    render(<PodsList pods={pods} />);

    const tracos = screen.getAllByText('—');
    expect(tracos).toHaveLength(2);
  });

  it('aplica um data-testid de status por pod para permitir estilização por fase', () => {
    const pods: PodInfo[] = [
      { name: 'gateway-1', app: 'gateway', status: 'Terminating', cpuMillis: 10, memoryMebibytes: 64 },
    ];

    render(<PodsList pods={pods} />);

    expect(screen.getByTestId('pod-status-gateway-1')).toHaveTextContent('Terminating');
  });

  it('mostra uma mensagem quando não há pods vivos', () => {
    render(<PodsList pods={[]} />);

    expect(screen.getByText(/nenhum pod/i)).toBeInTheDocument();
  });
});
