import { Injectable } from '@nestjs/common';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { Pedido } from './entities/pedido.entity';
import { PedidosService } from './pedidos.service';

@Injectable()
export class PedidosApplication {
  constructor(private readonly pedidosService: PedidosService) {}

  async criarPedido(dto: CreatePedidoDto, idempotencyKey: string): Promise<Pedido> {
    return this.pedidosService.criarPedido({
      produtoId: dto.produtoId,
      quantidade: dto.quantidade,
      idempotencyKey,
    });
  }
}
