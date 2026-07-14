import { randomUUID } from 'crypto';

/**
 * Uma tentativa de compra corresponde à sessão criada quando a tela de compra
 * carrega, não a cada requisição HTTP (negocio.md §4.2, Refinamento 1).
 * A mesma Idempotency-Key vale por toda a vida desta instância — inclusive
 * em qualquer retry automático — e só uma nova sessão gera uma nova chave.
 */
export class PurchaseAttemptSession {
  readonly idempotencyKey: string;

  constructor() {
    this.idempotencyKey = randomUUID();
  }
}
