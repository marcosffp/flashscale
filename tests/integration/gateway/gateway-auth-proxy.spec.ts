import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as http from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';

describe('Gateway — auth real + proxy L7 (negocio.md §3, ROTEIRO Etapa 3)', () => {
  let app: INestApplication;
  let fakeApi: http.Server;
  let ultimaRequisicaoRecebida:
    | { headers: http.IncomingHttpHeaders; body: unknown; url?: string }
    | undefined;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'segredo-de-teste-e2e';
    process.env.JWT_EXPIRES_IN = '15m';

    fakeApi = http.createServer((req, res) => {
      let corpo = '';
      req.on('data', (chunk) => (corpo += chunk));
      req.on('end', () => {
        ultimaRequisicaoRecebida = {
          headers: req.headers,
          body: corpo ? JSON.parse(corpo) : undefined,
          url: req.url,
        };
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ recebido: true }));
      });
    });
    await new Promise<void>((resolve) => fakeApi.listen(0, resolve));
    const { port } = fakeApi.address() as AddressInfo;
    process.env.API_BASE_URL = `http://localhost:${port}`;

    // Importado depois de setar as env vars: AuthModule lê JWT_SECRET no
    // momento da decoração da classe, então o módulo só pode ser carregado
    // com as variáveis de ambiente já no lugar.
    const { AppModule } = await import('../../../services/gateway/src/app.module');
    const { Test } = await import('@nestjs/testing');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => fakeApi.close(() => resolve()));
  });

  it('login retorna um JWT válido', async () => {
    const resposta = await request(app.getHttpServer()).post('/auth/login').send({ nome: 'Marcos' });

    expect(resposta.status).toBe(201);
    expect(typeof resposta.body.accessToken).toBe('string');
    expect(resposta.body.accessToken.split('.')).toHaveLength(3);
  });

  it('rejeita login sem nome', async () => {
    const resposta = await request(app.getHttpServer()).post('/auth/login').send({});

    expect(resposta.status).toBe(400);
  });

  it('rejeita requisição proxied sem token', async () => {
    const resposta = await request(app.getHttpServer()).post('/pedidos').send({ produtoId: 'abc' });

    expect(resposta.status).toBe(401);
  });

  it('rejeita token com assinatura inválida', async () => {
    const tokenForjado = new JwtService({ secret: 'chave-errada' }).sign({
      sub: 'Invasor',
      id: '1',
    });

    const resposta = await request(app.getHttpServer())
      .post('/pedidos')
      .set('Authorization', `Bearer ${tokenForjado}`)
      .send({});

    expect(resposta.status).toBe(401);
  });

  it('encaminha requisição com token válido pra api com os headers internos corretos', async () => {
    const login = await request(app.getHttpServer()).post('/auth/login').send({ nome: 'Marcos' });
    const { accessToken } = login.body;

    const resposta = await request(app.getHttpServer())
      .post('/pedidos')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', 'chave-123')
      .send({ produtoId: 'abc', quantidade: 1 });

    expect(resposta.status).toBe(201);
    expect(ultimaRequisicaoRecebida?.url).toBe('/pedidos');
    expect(ultimaRequisicaoRecebida?.headers['x-user-sub']).toBe('Marcos');
    expect(ultimaRequisicaoRecebida?.headers['x-user-id']).toEqual(expect.any(String));
    expect(ultimaRequisicaoRecebida?.headers['idempotency-key']).toBe('chave-123');
    expect(ultimaRequisicaoRecebida?.body).toEqual({ produtoId: 'abc', quantidade: 1 });
  });
});
