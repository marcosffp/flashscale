import { Pedido } from './entities/pedido.entity';
import { PedidoResponseDto } from './dto/pedido-response.dto';

export class PedidoMapper {
  static toResponseDto(pedido: Pedido): PedidoResponseDto {
    return {
      id: pedido.id,
      produtoId: pedido.produtoId,
      quantidade: pedido.quantidade,
      status: pedido.status,
      idempotencyKey: pedido.idempotencyKey,
      createdAt: pedido.createdAt,
    };
  }
}
