import { MigrationInterface, QueryRunner } from 'typeorm';

// UUID fixo e conhecido: o script k6 (tests/load/pedidos-load.js) e o botão
// "Disparar carga" do dashboard precisam de um produto real já existente no
// banco (produto_id tem FK pra produtos), então este produto de demonstração
// é semeado uma única vez com estoque alto o bastante pra sustentar a rampa
// de carga da Etapa 7 sem esgotar antes do HPA reagir.
export const PRODUTO_CARGA_ID = '11111111-1111-4111-8111-111111111111';
const ESTOQUE_INICIAL_CARGA = 500;

export class SeedProdutoCarga1700000000002 implements MigrationInterface {
  name = 'SeedProdutoCarga1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      INSERT INTO produtos (id, nome, estoque_disponivel)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO NOTHING;
      `,
      [PRODUTO_CARGA_ID, 'Produto de Carga — Demo Black Friday', ESTOQUE_INICIAL_CARGA],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM produtos WHERE id = $1;`, [PRODUTO_CARGA_ID]);
  }
}
