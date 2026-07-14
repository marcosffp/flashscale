import { PurchaseAttemptSession } from '../../../dashboard/src/purchase/purchase-attempt-session';

describe('PurchaseAttemptSession (negocio.md §4.2, Refinamento 1 — ciclo de vida da chave)', () => {
  it('gera a Idempotency-Key uma única vez quando a sessão é criada', () => {
    const sessao = new PurchaseAttemptSession();

    expect(sessao.idempotencyKey).toEqual(expect.any(String));
    expect(sessao.idempotencyKey.length).toBeGreaterThan(0);
  });

  it('reaproveita a mesma chave em múltiplas tentativas/retries dentro da mesma sessão', () => {
    const sessao = new PurchaseAttemptSession();

    const chaveNaPrimeiraTentativa = sessao.idempotencyKey;
    const chaveNoRetryAutomatico = sessao.idempotencyKey;

    expect(chaveNoRetryAutomatico).toBe(chaveNaPrimeiraTentativa);
  });

  it('gera uma chave diferente para uma nova sessão (nova tela de compra)', () => {
    const primeiraSessao = new PurchaseAttemptSession();
    const segundaSessao = new PurchaseAttemptSession();

    expect(segundaSessao.idempotencyKey).not.toBe(primeiraSessao.idempotencyKey);
  });
});
