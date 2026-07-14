import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ProdutosDomain } from '../produtos/produtos.domain';
import { Pedido } from './entities/pedido.entity';
import { StatusPedido } from './entities/status-pedido.enum';
import { NovoPedidoInput, PedidosDomain } from './pedidos.domain';

@Injectable()
export class PedidosService {
  constructor(
    private readonly pedidosDomain: PedidosDomain,
    private readonly produtosDomain: ProdutosDomain,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Fluxo transacional único (negocio.md §4.1 + §4.2):
   * 1. INSERT idempotente do pedido — se a chave já existe, retorna o pedido existente sem tocar no estoque.
   * 2. Só o request que efetivamente criou a linha tenta o UPDATE atômico de estoque.
   * 3. Status final do pedido é gravado dentro da mesma transação.
   */
  async criarPedido(input: NovoPedidoInput): Promise<Pedido> {
    return this.dataSource.transaction(async (manager) => {
      const { criado, pedido } = await this.pedidosDomain.inserirComIdempotencia(input, manager);

      if (!criado) {
        return pedido;
      }

      const estoqueDebitado = await this.produtosDomain.debitarEstoque(
        input.produtoId,
        input.quantidade,
        manager,
      );

      const statusFinal = estoqueDebitado ? StatusPedido.CONFIRMADO : StatusPedido.REJEITADO;

      return this.pedidosDomain.atualizarStatus(pedido.id, statusFinal, manager);
    });
  }
}
