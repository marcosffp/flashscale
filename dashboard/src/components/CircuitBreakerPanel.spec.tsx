import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CircuitBreakerPanel } from './CircuitBreakerPanel';

function respostaJson(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

describe('CircuitBreakerPanel (negocio.md §8 — indicador de estado do circuit breaker)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('mostra "Verificando…" antes da primeira resposta do gateway', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));

    render(<CircuitBreakerPanel gatewayUrl="http://gateway.local" />);

    expect(screen.getByTestId('circuit-breaker-estado')).toHaveTextContent('Verificando');
  });

  it('mostra "Fechado" quando o circuito está fechado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respostaJson({ state: 'fechado' })));

    render(<CircuitBreakerPanel gatewayUrl="http://gateway.local" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByTestId('circuit-breaker-estado')).toHaveTextContent('Fechado');
  });

  it('mostra "Aberto" quando o circuito está aberto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respostaJson({ state: 'aberto' })));

    render(<CircuitBreakerPanel gatewayUrl="http://gateway.local" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByTestId('circuit-breaker-estado')).toHaveTextContent('Aberto');
  });

  it('mostra "Meio-aberto" quando o circuito está meio-aberto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respostaJson({ state: 'meio-aberto' })));

    render(<CircuitBreakerPanel gatewayUrl="http://gateway.local" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByTestId('circuit-breaker-estado')).toHaveTextContent('Meio-aberto');
  });
});
