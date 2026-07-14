import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { FakeWebSocket } from '../test/fake-websocket';
import { useClusterSnapshot } from './use-cluster-snapshot';
import type { ClusterSnapshot } from '../types/cluster-snapshot';

const exemploSnapshot: ClusterSnapshot = {
  timestamp: '2026-07-13T12:00:00.000Z',
  deployments: [{ name: 'api', replicas: 3, readyReplicas: 3 }],
  pods: [{ name: 'api-abc', app: 'api', status: 'Running', cpuMillis: 120, memoryMebibytes: 256 }],
};

describe('useClusterSnapshot', () => {
  beforeEach(() => {
    FakeWebSocket.reset();
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('conecta no WebSocket usando a URL informada', () => {
    renderHook(() => useClusterSnapshot('ws://orchestrator.local'));

    expect(FakeWebSocket.latest.url).toBe('ws://orchestrator.local');
  });

  it('começa sem snapshot e com status "conectando"', () => {
    const { result } = renderHook(() => useClusterSnapshot('ws://orchestrator.local'));

    expect(result.current.snapshot).toBeNull();
    expect(result.current.status).toBe('conectando');
  });

  it('atualiza o snapshot e o status ao abrir e receber uma mensagem', () => {
    const { result } = renderHook(() => useClusterSnapshot('ws://orchestrator.local'));

    act(() => {
      FakeWebSocket.latest.emitOpen();
    });
    expect(result.current.status).toBe('aberta');

    act(() => {
      FakeWebSocket.latest.emitMessage(exemploSnapshot);
    });
    expect(result.current.snapshot).toEqual(exemploSnapshot);
  });

  it('marca status como "fechada" e reconecta automaticamente após a conexão cair', () => {
    const { result } = renderHook(() => useClusterSnapshot('ws://orchestrator.local'));
    const primeiraInstancia = FakeWebSocket.latest;

    act(() => {
      primeiraInstancia.emitOpen();
      primeiraInstancia.close();
    });
    expect(result.current.status).toBe('fechada');
    expect(FakeWebSocket.instances).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.latest).not.toBe(primeiraInstancia);
  });

  it('fecha o socket e cancela qualquer reconexão agendada ao desmontar', () => {
    const { unmount } = renderHook(() => useClusterSnapshot('ws://orchestrator.local'));
    const instancia = FakeWebSocket.latest;

    act(() => {
      instancia.emitOpen();
    });

    unmount();

    expect(instancia.closeCalls).toBe(1);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
