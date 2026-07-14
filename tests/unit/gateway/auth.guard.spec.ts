import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '../../../services/gateway/src/auth/auth.guard';

function criarContexto(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('AuthGuard (negocio.md §3 — valida assinatura e expiração de verdade)', () => {
  const jwtService = new JwtService({ secret: 'segredo-de-teste' });

  function criarGuard(publico: boolean): AuthGuard {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(publico),
    } as unknown as Reflector;
    return new AuthGuard(jwtService, reflector);
  }

  it('permite acesso a rotas marcadas @Public() mesmo sem token', async () => {
    const guard = criarGuard(true);
    const contexto = criarContexto({ headers: {} });

    await expect(guard.canActivate(contexto)).resolves.toBe(true);
  });

  it('rejeita requisição sem header Authorization', async () => {
    const guard = criarGuard(false);
    const contexto = criarContexto({ headers: {} });

    await expect(guard.canActivate(contexto)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejeita header Authorization que não é do tipo Bearer', async () => {
    const guard = criarGuard(false);
    const contexto = criarContexto({ headers: { authorization: 'Basic abc123' } });

    await expect(guard.canActivate(contexto)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejeita token com assinatura inválida', async () => {
    const guard = criarGuard(false);
    const outroJwtService = new JwtService({ secret: 'segredo-errado' });
    const tokenForjado = outroJwtService.sign({ sub: 'Marcos', id: '123' });
    const contexto = criarContexto({ headers: { authorization: `Bearer ${tokenForjado}` } });

    await expect(guard.canActivate(contexto)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejeita token expirado', async () => {
    const guard = criarGuard(false);
    const tokenExpirado = jwtService.sign({ sub: 'Marcos', id: '123' }, { expiresIn: '-1s' });
    const contexto = criarContexto({ headers: { authorization: `Bearer ${tokenExpirado}` } });

    await expect(guard.canActivate(contexto)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('aceita token válido e anexa o payload em request.user', async () => {
    const guard = criarGuard(false);
    const token = jwtService.sign({ sub: 'Marcos', id: '123' });
    const request = { headers: { authorization: `Bearer ${token}` } };
    const contexto = criarContexto(request);

    await expect(guard.canActivate(contexto)).resolves.toBe(true);
    expect(request).toMatchObject({ user: { sub: 'Marcos', id: '123' } });
  });
});
