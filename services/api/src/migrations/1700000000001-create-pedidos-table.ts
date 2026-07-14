import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePedidosTable1700000000001 implements MigrationInterface {
  name = 'CreatePedidosTable1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE pedidos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        idempotency_key VARCHAR(255) NOT NULL,
        produto_id UUID NOT NULL REFERENCES produtos(id),
        quantidade INTEGER NOT NULL CHECK (quantidade > 0),
        status VARCHAR(20) NOT NULL DEFAULT 'processando',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_pedidos_idempotency_key UNIQUE (idempotency_key)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX idx_pedidos_produto_id ON pedidos(produto_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE pedidos;`);
  }
}
