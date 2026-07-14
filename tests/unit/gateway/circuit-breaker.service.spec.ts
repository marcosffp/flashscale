import { CircuitBreakerService } from '../../../services/gateway/src/circuit-breaker/circuit-breaker.service';

describe('CircuitBreakerService (negocio.md §9 — gatilhos exatos)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('começa fechado', () => {
    const cb = new CircuitBreakerService();

    expect(cb.getState()).toBe('fechado');
    expect(cb.podeProsseguir()).toBe(true);
  });

  it('abre após 5 falhas consecutivas dentro de uma janela de 10s', () => {
    const cb = new CircuitBreakerService();

    for (let i = 0; i < 4; i++) {
      cb.registrarFalha();
    }
    expect(cb.getState()).toBe('fechado');

    cb.registrarFalha();
    expect(cb.getState()).toBe('aberto');
  });

  it('não abre se um sucesso interromper a sequência de falhas', () => {
    const cb = new CircuitBreakerService();

    cb.registrarFalha();
    cb.registrarFalha();
    cb.registrarFalha();
    cb.registrarFalha();
    cb.registrarSucesso();
    cb.registrarFalha();
    cb.registrarFalha();
    cb.registrarFalha();
    cb.registrarFalha();

    expect(cb.getState()).toBe('fechado');
  });

  it('não conta falhas fora da janela de 10s como consecutivas', () => {
    const cb = new CircuitBreakerService();

    cb.registrarFalha();
    cb.registrarFalha();
    cb.registrarFalha();
    cb.registrarFalha();

    jest.advanceTimersByTime(10_001);

    cb.registrarFalha();
    expect(cb.getState()).toBe('fechado');
  });

  it('rejeita requisições (podeProsseguir = false) enquanto aberto', () => {
    const cb = new CircuitBreakerService();
    for (let i = 0; i < 5; i++) cb.registrarFalha();

    expect(cb.getState()).toBe('aberto');
    expect(cb.podeProsseguir()).toBe(false);
  });

  it('vira meio-aberto após 5s e deixa passar exatamente 1 requisição de teste', () => {
    const cb = new CircuitBreakerService();
    for (let i = 0; i < 5; i++) cb.registrarFalha();

    jest.advanceTimersByTime(5_000);
    expect(cb.getState()).toBe('meio-aberto');

    expect(cb.podeProsseguir()).toBe(true);
    expect(cb.podeProsseguir()).toBe(false);
    expect(cb.podeProsseguir()).toBe(false);
  });

  it('fecha quando a requisição de teste em meio-aberto tem sucesso', () => {
    const cb = new CircuitBreakerService();
    for (let i = 0; i < 5; i++) cb.registrarFalha();
    jest.advanceTimersByTime(5_000);

    expect(cb.podeProsseguir()).toBe(true);
    cb.registrarSucesso();

    expect(cb.getState()).toBe('fechado');
    expect(cb.podeProsseguir()).toBe(true);
  });

  it('reabre e reinicia a contagem de 5s quando a requisição de teste em meio-aberto falha', () => {
    const cb = new CircuitBreakerService();
    for (let i = 0; i < 5; i++) cb.registrarFalha();
    jest.advanceTimersByTime(5_000);

    expect(cb.podeProsseguir()).toBe(true);
    cb.registrarFalha();

    expect(cb.getState()).toBe('aberto');
    expect(cb.podeProsseguir()).toBe(false);

    jest.advanceTimersByTime(4_999);
    expect(cb.getState()).toBe('aberto');

    jest.advanceTimersByTime(1);
    expect(cb.getState()).toBe('meio-aberto');
  });
});
