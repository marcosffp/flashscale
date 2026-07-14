import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProdutosModule } from '../produtos/produtos.module';
import { Pedido } from './entities/pedido.entity';
import { PedidosApplication } from './pedidos.application';
import { PedidosController } from './pedidos.controller';
import { PedidosDomain } from './pedidos.domain';
import { PedidosService } from './pedidos.service';

@Module({
  imports: [TypeOrmModule.forFeature([Pedido]), ProdutosModule],
  controllers: [PedidosController],
  providers: [PedidosApplication, PedidosService, PedidosDomain],
})
export class PedidosModule {}
