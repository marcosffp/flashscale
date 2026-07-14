import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { RepositoryAdapter } from '../common/repository-adapter';
import { Produto } from './entities/produto.entity';

@Injectable()
export class ProdutosDomain extends RepositoryAdapter<Produto> {
  constructor(@InjectRepository(Produto) repository: Repository<Produto>) {
    super(repository);
  }

  /**
   * Único UPDATE atômico que garante zero overselling (negocio.md §4.1):
   * o decremento e a checagem de disponibilidade acontecem na mesma instrução SQL.
   */
  async debitarEstoque(
    produtoId: string,
    quantidade: number,
    manager?: EntityManager,
  ): Promise<boolean> {
    // manager.query() para UPDATE/DELETE retorna a tupla [rows, rowCount], não a lista de rows direto.
    const [rows]: [Array<{ id: string }>, number] = await this.manager(manager).query(
      `UPDATE produtos
       SET estoque_disponivel = estoque_disponivel - $1, updated_at = now()
       WHERE id = $2 AND estoque_disponivel >= $1
       RETURNING id`,
      [quantidade, produtoId],
    );
    return rows.length > 0;
  }
}
