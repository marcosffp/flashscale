import { StatusPedido } from '../entities/status-pedido.enum';

export class PedidoResponseDto {
  id: string;
  produtoId: string;
  quantidade: number;
  status: StatusPedido;
  idempotencyKey: string;
  createdAt: Date;
}
