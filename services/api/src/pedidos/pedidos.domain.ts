import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { RepositoryAdapter } from '../common/repository-adapter';
import { Pedido } from './entities/pedido.entity';
import { StatusPedido } from './entities/status-pedido.enum';

export interface NovoPedidoInput {
  idempotencyKey: string;
  produtoId: string;
  quantidade: number;
}

export interface ResultadoInsercaoPedido {
  criado: boolean;
  pedido: Pedido;
}

@Injectable()
export class PedidosDomain extends RepositoryAdapter<Pedido> {
  constructor(@InjectRepository(Pedido) repository: Repository<Pedido>) {
    super(repository);
  }

  /**
   * INSERT ... ON CONFLICT DO NOTHING atômico (negocio.md §4.2, Refinamento 2).
   * Nunca SELECT seguido de INSERT: isso reintroduziria a mesma race que o
   * UPDATE atômico de estoque foi desenhado para evitar.
   */
  async inserirComIdempotencia(
    input: NovoPedidoInput,
    manager?: EntityManager,
  ): Promise<ResultadoInsercaoPedido> {
    // Com RETURNING, o driver pg retorna o array de linhas diretamente.
    const inseridos = await this.manager(manager).query(
      `INSERT INTO pedidos (idempotency_key, produto_id, quantidade, status)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING *`,
      [input.idempotencyKey, input.produtoId, input.quantidade, StatusPedido.PROCESSANDO],
    );

    if (inseridos.length > 0) {
      return { criado: true, pedido: this.paraEntidade(inseridos[0]) };
    }

    const existentes = await this.manager(manager).query(
      `SELECT * FROM pedidos WHERE idempotency_key = $1`,
      [input.idempotencyKey],
    );

    return { criado: false, pedido: this.paraEntidade(existentes[0]) };
  }

  async atualizarStatus(
    id: string,
    status: StatusPedido,
    manager?: EntityManager,
  ): Promise<Pedido> {
    // manager.query() para UPDATE/DELETE retorna a tupla [rows, rowCount], não a lista de rows direto.
    const [records]: [any[], number] = await this.manager(manager).query(
      `UPDATE pedidos SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [status, id],
    );
    return this.paraEntidade(records[0]);
  }

  private paraEntidade(row: any): Pedido {
    const pedido = new Pedido();
    pedido.id = row.id;
    pedido.idempotencyKey = row.idempotency_key;
    pedido.produtoId = row.produto_id;
    pedido.quantidade = row.quantidade;
    pedido.status = row.status;
    pedido.createdAt = row.created_at;
    pedido.updatedAt = row.updated_at;
    return pedido;
  }
}
