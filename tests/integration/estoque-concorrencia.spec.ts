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
import { Produto } from '../../services/api/src/produtos/entities/produto.entity';

describe('Concorrência de estoque (negocio.md §4.3.1)', () => {
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

  it('aceita exatamente 5 de 10 pedidos concorrentes de 1 unidade quando o estoque é 5, sem overselling', async () => {
    const produto: Produto = await criarProduto(dataSource, { estoqueDisponivel: 5 });

    const requisicoes = Array.from({ length: 10 }, () =>
      request(app.getHttpServer())
        .post('/pedidos')
        .set('Idempotency-Key', randomUUID())
        .send({ produtoId: produto.id, quantidade: 1 }),
    );

    const respostas = await Promise.all(requisicoes);

    const aceitos = respostas.filter((r) => r.status === 201);
    const rejeitados = respostas.filter((r) => r.status === 409);

    expect(aceitos).toHaveLength(5);
    expect(rejeitados).toHaveLength(5);

    const produtoFinal = await dataSource
      .getRepository(Produto)
      .findOneByOrFail({ id: produto.id });

    expect(produtoFinal.estoqueDisponivel).toBe(0);
  });

  it('nunca deixa o estoque ficar negativo sob alta concorrência (estoque=1, 20 pedidos simultâneos)', async () => {
    const produto: Produto = await criarProduto(dataSource, { estoqueDisponivel: 1 });

    const requisicoes = Array.from({ length: 20 }, () =>
      request(app.getHttpServer())
        .post('/pedidos')
        .set('Idempotency-Key', randomUUID())
        .send({ produtoId: produto.id, quantidade: 1 }),
    );

    const respostas = await Promise.all(requisicoes);
    const aceitos = respostas.filter((r) => r.status === 201);

    expect(aceitos).toHaveLength(1);

    const produtoFinal = await dataSource
      .getRepository(Produto)
      .findOneByOrFail({ id: produto.id });

    expect(produtoFinal.estoqueDisponivel).toBe(0);
  });
});
