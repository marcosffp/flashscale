import { CircuitState } from '../circuit-breaker.service';

export class CircuitBreakerStatusDto {
  state: CircuitState;
}
