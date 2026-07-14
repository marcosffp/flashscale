import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../../../services/gateway/src/auth/auth.service';

describe('AuthService (negocio.md §3 — login sem senha, JWT real)', () => {
  const jwtService = new JwtService({
    secret: 'segredo-de-teste',
    signOptions: { expiresIn: '15m' },
  });
  const authService = new AuthService(jwtService);

  it('assina um JWT real contendo o nome como sub e um id único de sessão', () => {
    const resposta = authService.login('Marcos');

    const payload = jwtService.verify(resposta.accessToken);
    expect(payload.sub).toBe('Marcos');
    expect(typeof payload.id).toBe('string');
    expect(payload.id.length).toBeGreaterThan(0);
  });

  it('gera um id de sessão diferente a cada login, mesmo com o mesmo nome', () => {
    const primeiro = authService.login('Marcos');
    const segundo = authService.login('Marcos');

    const payload1 = jwtService.verify(primeiro.accessToken);
    const payload2 = jwtService.verify(segundo.accessToken);

    expect(payload1.id).not.toBe(payload2.id);
  });

  it('o token não é verificável com uma chave diferente', () => {
    const resposta = authService.login('Marcos');
    const outroJwtService = new JwtService({ secret: 'outro-segredo' });

    expect(() => outroJwtService.verify(resposta.accessToken)).toThrow();
  });
});
