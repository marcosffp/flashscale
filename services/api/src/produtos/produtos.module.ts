import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Produto } from './entities/produto.entity';
import { ProdutosDomain } from './produtos.domain';

@Module({
  imports: [TypeOrmModule.forFeature([Produto])],
  providers: [ProdutosDomain],
  exports: [ProdutosDomain],
})
export class ProdutosModule {}
