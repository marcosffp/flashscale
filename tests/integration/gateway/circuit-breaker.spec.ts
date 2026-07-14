import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as http from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';

describe('Gateway — circuit breaker (negocio.md §9, ROTEIRO Etapa 11)', () => {
  let app: INestApplication;
  let fakeApi: http.Server;
  let chamadasRecebidasPelaApi: number;
  let proximaRespostaDaApi: { status: number };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'segredo-de-teste-circuit-breaker';
    process.env.JWT_EXPIRES_IN = '15m';

    fakeApi = http.createServer((req, res) => {
      chamadasRecebidasPelaApi += 1;
      res.writeHead(proximaRespostaDaApi.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({}));
    });
    await new Promise<void>((resolve) => fakeApi.listen(0, resolve));
    const { port } = fakeApi.address() as AddressInfo;
    process.env.API_BASE_URL = `http://localhost:${port}`;

    const { AppModule } = await import('../../../services/gateway/src/app.module');
    const { Test } = await import('@nestjs/testing');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  beforeEach(() => {
    chamadasRecebidasPelaApi = 0;
    proximaRespostaDaApi = { status: 200 };
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => fakeApi.close(() => resolve()));
  });

  async function login(): Promise<string> {
    const resposta = await request(app.getHttpServer()).post('/auth/login').send({ nome: 'Marcos' });
    return resposta.body.accessToken;
  }

  it('GET /circuit-breaker/status não exige token e começa fechado', async () => {
    const resposta = await request(app.getHttpServer()).get('/circuit-breaker/status');

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ state: 'fechado' });
  });

  it('abre o circuito após 5 falhas 5xx consecutivas e passa a responder 503 imediato sem chamar a api', async () => {
    const token = await login();
    proximaRespostaDaApi = { status: 500 };

    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .get('/produtos')
        .set('Authorization', `Bearer ${token}`);
    }

    expect(chamadasRecebidasPelaApi).toBe(5);
    expect((await request(app.getHttpServer()).get('/circuit-breaker/status')).body).toEqual({
      state: 'aberto',
    });

    const chamadasAntes = chamadasRecebidasPelaApi;
    const resposta = await request(app.getHttpServer())
      .get('/produtos')
      .set('Authorization', `Bearer ${token}`);

    expect(resposta.status).toBe(503);
    expect(resposta.body.message).toMatch(/alta demanda/i);
    expect(chamadasRecebidasPelaApi).toBe(chamadasAntes);
  });

  it('vira meio-aberto após 5s e fecha de novo quando a requisição de teste tem sucesso', async () => {
    const token = await login();
    proximaRespostaDaApi = { status: 500 };
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .get('/produtos')
        .set('Authorization', `Bearer ${token}`);
    }
    expect((await request(app.getHttpServer()).get('/circuit-breaker/status')).body).toEqual({
      state: 'aberto',
    });

    await new Promise((resolve) => setTimeout(resolve, 5_100));
    expect((await request(app.getHttpServer()).get('/circuit-breaker/status')).body).toEqual({
      state: 'meio-aberto',
    });

    proximaRespostaDaApi = { status: 200 };
    const respostaDeTeste = await request(app.getHttpServer())
      .get('/produtos')
      .set('Authorization', `Bearer ${token}`);

    expect(respostaDeTeste.status).toBe(200);
    expect((await request(app.getHttpServer()).get('/circuit-breaker/status')).body).toEqual({
      state: 'fechado',
    });

    const resposta = await request(app.getHttpServer())
      .get('/produtos')
      .set('Authorization', `Bearer ${token}`);
    expect(resposta.status).toBe(200);
  }, 10_000);
});
