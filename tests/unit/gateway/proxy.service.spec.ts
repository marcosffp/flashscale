import { of, throwError } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { ServiceUnavailableException } from '@nestjs/common';
import { ProxyService } from '../../../services/gateway/src/proxy/proxy.service';
import { CircuitBreakerService } from '../../../services/gateway/src/circuit-breaker/circuit-breaker.service';

describe('ProxyService (negocio.md §3 — proxy L7 propagando X-User-Id/X-User-Sub)', () => {
  const originalApiBaseUrl = process.env.API_BASE_URL;

  afterEach(() => {
    process.env.API_BASE_URL = originalApiBaseUrl;
  });

  it('encaminha a requisição pra api com os headers internos corretos', async () => {
    process.env.API_BASE_URL = 'http://api.internal:3001';
    const requestFn = jest.fn().mockReturnValue(of({ status: 201, data: { ok: true }, headers: {} }));
    const httpService = { request: requestFn } as unknown as HttpService;
    const proxyService = new ProxyService(httpService, new CircuitBreakerService());

    const req = {
      method: 'POST',
      originalUrl: '/pedidos',
      body: { produtoId: 'abc' },
      headers: { 'idempotency-key': 'xyz', authorization: 'Bearer token-do-cliente' },
      user: { id: 'user-uuid', sub: 'Marcos' },
    } as any;

    await proxyService.encaminhar(req);

    expect(requestFn).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: 'http://api.internal:3001/pedidos',
        data: { produtoId: 'abc' },
        headers: expect.objectContaining({
          'X-User-Id': 'user-uuid',
          'X-User-Sub': 'Marcos',
          'idempotency-key': 'xyz',
        }),
      }),
    );
  });

  it('não propaga o header Authorization original do cliente pra api', async () => {
    process.env.API_BASE_URL = 'http://api.internal:3001';
    const requestFn = jest.fn().mockReturnValue(of({ status: 200, data: {}, headers: {} }));
    const httpService = { request: requestFn } as unknown as HttpService;
    const proxyService = new ProxyService(httpService, new CircuitBreakerService());

    const req = {
      method: 'GET',
      originalUrl: '/qualquer',
      body: {},
      headers: { authorization: 'Bearer token-do-cliente' },
      user: { id: 'user-uuid', sub: 'Marcos' },
    } as any;

    await proxyService.encaminhar(req);

    const chamada = requestFn.mock.calls[0][0];
    expect(chamada.headers.authorization).toBeUndefined();
    expect(chamada.headers.Authorization).toBeUndefined();
  });

  it('usa http://localhost:3001 como padrão quando API_BASE_URL não está definido', async () => {
    delete process.env.API_BASE_URL;
    const requestFn = jest.fn().mockReturnValue(of({ status: 200, data: {}, headers: {} }));
    const httpService = { request: requestFn } as unknown as HttpService;
    const proxyService = new ProxyService(httpService, new CircuitBreakerService());

    const req = {
      method: 'GET',
      originalUrl: '/produtos',
      body: {},
      headers: {},
      user: { id: 'user-uuid', sub: 'Marcos' },
    } as any;

    await proxyService.encaminhar(req);

    expect(requestFn).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://localhost:3001/produtos' }),
    );
  });

  describe('circuit breaker (negocio.md §9)', () => {
    const req = {
      method: 'GET',
      originalUrl: '/produtos',
      body: {},
      headers: {},
      user: { id: 'user-uuid', sub: 'Marcos' },
    } as any;

    it('rejeita com 503 imediato sem chamar a api quando o circuito está aberto', async () => {
      const requestFn = jest.fn();
      const httpService = { request: requestFn } as unknown as HttpService;
      const circuitBreaker = new CircuitBreakerService();
      jest.spyOn(circuitBreaker, 'podeProsseguir').mockReturnValue(false);
      const proxyService = new ProxyService(httpService, circuitBreaker);

      await expect(proxyService.encaminhar(req)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(requestFn).not.toHaveBeenCalled();
    });

    it('registra falha no circuito quando a api responde 5xx', async () => {
      const requestFn = jest.fn().mockReturnValue(of({ status: 502, data: {}, headers: {} }));
      const httpService = { request: requestFn } as unknown as HttpService;
      const circuitBreaker = new CircuitBreakerService();
      const registrarFalha = jest.spyOn(circuitBreaker, 'registrarFalha');
      const proxyService = new ProxyService(httpService, circuitBreaker);

      await proxyService.encaminhar(req);

      expect(registrarFalha).toHaveBeenCalledTimes(1);
    });

    it('registra falha no circuito quando a chamada pra api lança erro (timeout/rede)', async () => {
      const requestFn = jest.fn().mockReturnValue(throwError(() => new Error('timeout')));
      const httpService = { request: requestFn } as unknown as HttpService;
      const circuitBreaker = new CircuitBreakerService();
      const registrarFalha = jest.spyOn(circuitBreaker, 'registrarFalha');
      const proxyService = new ProxyService(httpService, circuitBreaker);

      await expect(proxyService.encaminhar(req)).rejects.toThrow('timeout');
      expect(registrarFalha).toHaveBeenCalledTimes(1);
    });

    it('registra sucesso no circuito quando a api responde 2xx/4xx', async () => {
      const requestFn = jest.fn().mockReturnValue(of({ status: 404, data: {}, headers: {} }));
      const httpService = { request: requestFn } as unknown as HttpService;
      const circuitBreaker = new CircuitBreakerService();
      const registrarSucesso = jest.spyOn(circuitBreaker, 'registrarSucesso');
      const proxyService = new ProxyService(httpService, circuitBreaker);

      await proxyService.encaminhar(req);

      expect(registrarSucesso).toHaveBeenCalledTimes(1);
    });
  });
});
