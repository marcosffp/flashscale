import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StatusPedido } from './status-pedido.enum';

@Entity('pedidos')
export class Pedido {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 255, unique: true })
  idempotencyKey: string;

  @Column({ name: 'produto_id', type: 'uuid' })
  produtoId: string;

  @Column({ type: 'int' })
  quantidade: number;

  @Column({ type: 'varchar', length: 20, default: StatusPedido.PROCESSANDO })
  status: StatusPedido;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
