import { useEffect, useState } from 'react';

// Espelha CircuitState em services/gateway/src/circuit-breaker/circuit-breaker.service.ts
// — 'desconhecido' é só do lado do dashboard, antes da primeira resposta chegar.
export type CircuitBreakerState = 'fechado' | 'aberto' | 'meio-aberto' | 'desconhecido';

const POLL_INTERVAL_MS = 2000;

export function useCircuitBreakerStatus(gatewayUrl: string): CircuitBreakerState {
  const [state, setState] = useState<CircuitBreakerState>('desconhecido');

  useEffect(() => {
    let cancelled = false;

    async function consultar(): Promise<void> {
      try {
        const res = await fetch(`${gatewayUrl}/circuit-breaker/status`);
        const body = (await res.json()) as { state?: CircuitBreakerState };
        if (!cancelled && body.state) {
          setState(body.state);
        }
      } catch {
        // Mantém o último estado conhecido em vez de piscar "desconhecido" a
        // cada falha transitória de rede durante o polling.
      }
    }

    consultar();
    const intervalId = setInterval(consultar, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [gatewayUrl]);

  return state;
}
