import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchLoad } from './load-dispatcher';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('dispatchLoad', () => {
  const options = {
    gatewayUrl: 'http://gateway.local',
    produtoId: '11111111-1111-4111-8111-111111111111',
    totalRequisicoes: 4,
    concorrencia: 2,
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('faz login uma vez e usa o token em todas as requisições de pedido', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/login')) {
        return jsonResponse(201, { accessToken: 'token-123' });
      }
      return jsonResponse(201, { id: 'pedido-1', status: 'confirmado' });
    });

    await dispatchLoad(options);

    const loginCalls = fetchMock.mock.calls.filter(([url]) => url === 'http://gateway.local/auth/login');
    expect(loginCalls).toHaveLength(1);

    const pedidoCalls = fetchMock.mock.calls.filter(([url]) => url === 'http://gateway.local/pedidos');
    expect(pedidoCalls).toHaveLength(4);
    for (const [, init] of pedidoCalls) {
      expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer token-123' });
    }
  });

  it('envia uma Idempotency-Key distinta por requisição de pedido', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/login')) {
        return jsonResponse(201, { accessToken: 'token-123' });
      }
      return jsonResponse(201, { id: 'pedido-1', status: 'confirmado' });
    });

    await dispatchLoad(options);

    const pedidoCalls = fetchMock.mock.calls.filter(([url]) => url === 'http://gateway.local/pedidos');
    const chaves = pedidoCalls.map(([, init]) => (init as RequestInit).headers as Record<string, string>);
    const chavesUnicas = new Set(chaves.map((headers) => headers['Idempotency-Key']));
    expect(chavesUnicas.size).toBe(4);
  });

  it('classifica 201 como confirmado e 409 como rejeitado', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    let chamada = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/login')) {
        return jsonResponse(201, { accessToken: 'token-123' });
      }
      chamada += 1;
      return chamada % 2 === 0
        ? jsonResponse(409, { status: 'rejeitado' })
        : jsonResponse(201, { status: 'confirmado' });
    });

    const resultado = await dispatchLoad(options);

    expect(resultado).toEqual({ enviados: 4, confirmados: 2, rejeitados: 2, erros: 0 });
  });

  it('conta como erro respostas inesperadas ou falhas de rede, sem derrubar o disparo', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    let chamada = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/login')) {
        return jsonResponse(201, { accessToken: 'token-123' });
      }
      chamada += 1;
      if (chamada === 1) throw new Error('conexão recusada');
      return jsonResponse(500, { message: 'erro interno' });
    });

    const resultado = await dispatchLoad(options);

    expect(resultado.enviados).toBe(4);
    expect(resultado.confirmados).toBe(0);
    expect(resultado.rejeitados).toBe(0);
    expect(resultado.erros).toBe(4);
  });

  it('respeita o limite de concorrência informado', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    let emVoo = 0;
    let picoDeConcorrencia = 0;

    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/login')) {
        return jsonResponse(201, { accessToken: 'token-123' });
      }
      emVoo += 1;
      picoDeConcorrencia = Math.max(picoDeConcorrencia, emVoo);
      await new Promise((resolve) => setTimeout(resolve, 5));
      emVoo -= 1;
      return jsonResponse(201, { status: 'confirmado' });
    });

    await dispatchLoad(options);

    expect(picoDeConcorrencia).toBeLessThanOrEqual(2);
  });

  it('reporta progresso a cada requisição concluída', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith('/auth/login')) {
        return jsonResponse(201, { accessToken: 'token-123' });
      }
      return jsonResponse(201, { status: 'confirmado' });
    });

    const progressos: number[] = [];
    await dispatchLoad(options, (progresso) => progressos.push(progresso.enviados));

    expect(progressos).toHaveLength(4);
    expect(progressos.at(-1)).toBe(4);
  });
});
