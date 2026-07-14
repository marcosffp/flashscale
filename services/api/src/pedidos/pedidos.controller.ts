import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { PedidoResponseDto } from './dto/pedido-response.dto';
import { StatusPedido } from './entities/status-pedido.enum';
import { PedidosApplication } from './pedidos.application';
import { PedidoMapper } from './pedidos.mapper';

@Controller('pedidos')
export class PedidosController {
  constructor(private readonly pedidosApplication: PedidosApplication) {}

  @Post()
  async criar(
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: CreatePedidoDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PedidoResponseDto> {
    if (!idempotencyKey) {
      throw new BadRequestException('Header Idempotency-Key é obrigatório');
    }

    const pedido = await this.pedidosApplication.criarPedido(dto, idempotencyKey);

    res.status(
      pedido.status === StatusPedido.CONFIRMADO ? HttpStatus.CREATED : HttpStatus.CONFLICT,
    );

    return PedidoMapper.toResponseDto(pedido);
  }
}
