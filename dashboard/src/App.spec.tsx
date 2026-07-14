import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { UseClusterSnapshotResult } from './hooks/use-cluster-snapshot';
import type { ClusterSnapshot } from './types/cluster-snapshot';

const { useClusterSnapshotMock } = vi.hoisted(() => ({ useClusterSnapshotMock: vi.fn() }));

vi.mock('./hooks/use-cluster-snapshot', () => ({
  useClusterSnapshot: useClusterSnapshotMock,
}));

function mockHook(result: UseClusterSnapshotResult): void {
  useClusterSnapshotMock.mockReturnValue(result);
}

const exemploSnapshot: ClusterSnapshot = {
  timestamp: '2026-07-13T12:00:00.000Z',
  deployments: [{ name: 'api', replicas: 3, readyReplicas: 3 }],
  pods: [{ name: 'api-abc', app: 'api', status: 'Running', cpuMillis: 120, memoryMebibytes: 256 }],
};

describe('App', () => {
  it('mostra uma mensagem de espera antes do primeiro snapshot chegar', () => {
    mockHook({ snapshot: null, status: 'conectando' });

    render(<App />);

    expect(screen.getByText(/aguardando/i)).toBeInTheDocument();
    expect(screen.queryByText('api-abc')).not.toBeInTheDocument();
  });

  it('renderiza os painéis de deployments e pods quando o snapshot chega', () => {
    mockHook({ snapshot: exemploSnapshot, status: 'aberta' });

    render(<App />);

    expect(screen.getByText('3/3')).toBeInTheDocument();
    expect(screen.getByText('api-abc')).toBeInTheDocument();
  });

  it('mostra um aviso de conexão perdida quando o status é "fechada"', () => {
    mockHook({ snapshot: exemploSnapshot, status: 'fechada' });

    render(<App />);

    expect(screen.getByText(/conex(ã|a)o perdida/i)).toBeInTheDocument();
  });

  it('não mostra aviso de conexão perdida quando está aberta', () => {
    mockHook({ snapshot: exemploSnapshot, status: 'aberta' });

    render(<App />);

    expect(screen.queryByText(/conex(ã|a)o perdida/i)).not.toBeInTheDocument();
  });
});
