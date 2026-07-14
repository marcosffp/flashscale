import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCircuitBreakerStatus } from './use-circuit-breaker-status';

function respostaJson(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

async function avancar(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useCircuitBreakerStatus (negocio.md §9 — indicador de estado no dashboard)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('começa como "desconhecido" antes da primeira resposta', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));

    const { result } = renderHook(() => useCircuitBreakerStatus('http://gateway.local'));

    expect(result.current).toBe('desconhecido');
  });

  it('consulta GET /circuit-breaker/status no gateway e atualiza o estado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaJson({ state: 'fechado' }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCircuitBreakerStatus('http://gateway.local'));
    await avancar(0);

    expect(fetchMock).toHaveBeenCalledWith('http://gateway.local/circuit-breaker/status');
    expect(result.current).toBe('fechado');
  });

  it('faz polling periódico e reflete mudanças de estado', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respostaJson({ state: 'fechado' }))
      .mockResolvedValueOnce(respostaJson({ state: 'aberto' }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCircuitBreakerStatus('http://gateway.local'));
    await avancar(0);
    expect(result.current).toBe('fechado');

    await avancar(2000);
    expect(result.current).toBe('aberto');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('mantém o último estado conhecido quando uma consulta falha', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respostaJson({ state: 'meio-aberto' }))
      .mockRejectedValueOnce(new Error('falha de rede'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useCircuitBreakerStatus('http://gateway.local'));
    await avancar(0);
    expect(result.current).toBe('meio-aberto');

    await avancar(2000);
    expect(result.current).toBe('meio-aberto');
  });

  it('para o polling ao desmontar', async () => {
    const fetchMock = vi.fn().mockResolvedValue(respostaJson({ state: 'fechado' }));
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = renderHook(() => useCircuitBreakerStatus('http://gateway.local'));
    await avancar(0);
    unmount();

    const chamadasAntes = fetchMock.mock.calls.length;
    await avancar(5000);
    expect(fetchMock.mock.calls.length).toBe(chamadasAntes);
  });
});
