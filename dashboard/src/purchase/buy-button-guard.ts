export type ResultadoClique = 'executado' | 'ignorado';

/**
 * Guarda o botão de compra contra double-click (negocio.md §4.2, Refinamento 1).
 * A chave de idempotência sozinha só protege contra retry automático de rede —
 * sem desabilitar o botão no clique, dois cliques rápidos do usuário criariam
 * duas tentativas de compra distintas e legítimas aos olhos do backend.
 */
export class BuyButtonGuard {
  private disabled = false;

  get estaDesabilitado(): boolean {
    return this.disabled;
  }

  async executar(tentativaDeCompra: () => Promise<void>): Promise<ResultadoClique> {
    if (this.disabled) {
      return 'ignorado';
    }

    this.disabled = true;
    await tentativaDeCompra();
    return 'executado';
  }
}
