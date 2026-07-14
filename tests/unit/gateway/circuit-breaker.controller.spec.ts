import { CircuitBreakerController } from '../../../services/gateway/src/circuit-breaker/circuit-breaker.controller';
import { CircuitBreakerService } from '../../../services/gateway/src/circuit-breaker/circuit-breaker.service';

describe('CircuitBreakerController (negocio.md §8 — indicador de estado no dashboard)', () => {
  it('retorna o estado atual do circuito', () => {
    const circuitBreaker = new CircuitBreakerService();
    const controller = new CircuitBreakerController(circuitBreaker);

    expect(controller.status()).toEqual({ state: 'fechado' });

    for (let i = 0; i < 5; i++) circuitBreaker.registrarFalha();
    expect(controller.status()).toEqual({ state: 'aberto' });
  });
});
