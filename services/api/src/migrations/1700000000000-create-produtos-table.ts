import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProdutosTable1700000000000 implements MigrationInterface {
  name = 'CreateProdutosTable1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
    await queryRunner.query(`
      CREATE TABLE produtos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nome VARCHAR(255) NOT NULL,
        estoque_disponivel INTEGER NOT NULL CHECK (estoque_disponivel >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE produtos;`);
  }
}
