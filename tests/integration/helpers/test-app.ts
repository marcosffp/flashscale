import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../../../services/api/src/app.module';
import { Produto } from '../../../services/api/src/produtos/entities/produto.entity';

export async function criarAppDeTeste(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  // Liga o servidor numa porta efêmera: sem isso, o supertest detecta o
  // http.Server ainda não escutando e, em cada chamada concorrente, assume
  // que é dono do listener e fecha o server sozinho ao terminar — matando
  // as outras requisições em voo com ECONNRESET sob alta concorrência.
  await app.listen(0);
  return app;
}

export function obterDataSource(app: INestApplication): DataSource {
  return app.get<DataSource>(getDataSourceToken());
}

export async function limparTabelas(dataSource: DataSource): Promise<void> {
  await dataSource.query('TRUNCATE TABLE pedidos, produtos RESTART IDENTITY CASCADE');
}

export async function criarProduto(
  dataSource: DataSource,
  overrides: Partial<Produto> = {},
): Promise<Produto> {
  const repo = dataSource.getRepository(Produto);
  const produto = repo.create({
    nome: overrides.nome ?? 'PlayStation 5',
    estoqueDisponivel: overrides.estoqueDisponivel ?? 5,
  });
  return repo.save(produto);
}
