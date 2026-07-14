import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  criarAppDeTeste,
  criarProduto,
  limparTabelas,
  obterDataSource,
} from './helpers/test-app';
import { Pedido } from '../../services/api/src/pedidos/entities/pedido.entity';
import { Produto } from '../../services/api/src/produtos/entities/produto.entity';

describe('Concorrência de idempotência (negocio.md §4.3.2)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await criarAppDeTeste();
    dataSource = obterDataSource(app);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await limparTabelas(dataSource);
  });

  it('cria exatamente um pedido quando 15 requisições concorrentes usam a mesma Idempotency-Key', async () => {
    const produto: Produto = await criarProduto(dataSource, { estoqueDisponivel: 5 });
    const idempotencyKey = randomUUID();

    const requisicoes = Array.from({ length: 15 }, () =>
      request(app.getHttpServer())
        .post('/pedidos')
        .set('Idempotency-Key', idempotencyKey)
        .send({ produtoId: produto.id, quantidade: 1 }),
    );

    const respostas = await Promise.all(requisicoes);

    const idsRetornados = new Set(respostas.map((r) => r.body.id));
    expect(idsRetornados.size).toBe(1);

    respostas.forEach((r) => {
      expect([201, 409]).toContain(r.status);
    });

    const pedidosNoBanco = await dataSource
      .getRepository(Pedido)
      .findBy({ idempotencyKey });

    expect(pedidosNoBanco).toHaveLength(1);

    const produtoFinal = await dataSource
      .getRepository(Produto)
      .findOneByOrFail({ id: produto.id });

    expect(produtoFinal.estoqueDisponivel).toBe(4);
  });

  it('todas as respostas concorrentes retornam o mesmo status final do pedido', async () => {
    const produto: Produto = await criarProduto(dataSource, { estoqueDisponivel: 0 });
    const idempotencyKey = randomUUID();

    const requisicoes = Array.from({ length: 10 }, () =>
      request(app.getHttpServer())
        .post('/pedidos')
        .set('Idempotency-Key', idempotencyKey)
        .send({ produtoId: produto.id, quantidade: 1 }),
    );

    const respostas = await Promise.all(requisicoes);
    const statusUnicos = new Set(respostas.map((r) => r.status));

    expect(statusUnicos.size).toBe(1);
    expect(statusUnicos.has(409)).toBe(true);
  });
});
