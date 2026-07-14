/**
 * Não existe tabela de usuários no MVP (negocio.md §3): `sub` é o `nome`
 * informado no login, e `id` é um identificador único gerado por sessão de
 * login — os dois são propagados como X-User-Sub/X-User-Id pra api/orchestrator.
 */
export interface JwtPayload {
  sub: string;
  id: string;
}
