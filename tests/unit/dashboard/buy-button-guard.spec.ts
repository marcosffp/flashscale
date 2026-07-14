import { BuyButtonGuard } from '../../../dashboard/src/purchase/buy-button-guard';

describe('BuyButtonGuard (negocio.md §4.2, Refinamento 1 — double-click)', () => {
  it('começa habilitado, antes de qualquer clique', () => {
    const guard = new BuyButtonGuard();

    expect(guard.estaDesabilitado).toBe(false);
  });

  it('desabilita imediatamente no primeiro clique, antes da tentativa terminar', () => {
    const guard = new BuyButtonGuard();

    void guard.executar(() => new Promise(() => {}));

    expect(guard.estaDesabilitado).toBe(true);
  });

  it('executa a tentativa de compra no primeiro clique', async () => {
    const guard = new BuyButtonGuard();
    const tentativaDeCompra = jest.fn().mockResolvedValue(undefined);

    const resultado = await guard.executar(tentativaDeCompra);

    expect(resultado).toBe('executado');
    expect(tentativaDeCompra).toHaveBeenCalledTimes(1);
  });

  it('ignora cliques concorrentes disparados enquanto a primeira tentativa está em andamento', async () => {
    const guard = new BuyButtonGuard();
    const tentativaDeCompra = jest.fn().mockResolvedValue(undefined);

    const resultados = await Promise.all([
      guard.executar(tentativaDeCompra),
      guard.executar(tentativaDeCompra),
      guard.executar(tentativaDeCompra),
    ]);

    expect(tentativaDeCompra).toHaveBeenCalledTimes(1);
    expect(resultados.filter((r) => r === 'executado')).toHaveLength(1);
    expect(resultados.filter((r) => r === 'ignorado')).toHaveLength(2);
  });
});
