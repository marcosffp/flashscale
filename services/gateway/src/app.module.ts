import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CircuitBreakerModule } from './circuit-breaker/circuit-breaker.module';
import { ProxyModule } from './proxy/proxy.module';

@Module({
  // Ordem importa: ProxyController registra um catch-all (`@All('*')`), então
  // qualquer módulo com rota específica precisa ser importado antes dele pra
  // não ser engolido pelo wildcard.
  imports: [AuthModule, CircuitBreakerModule, ProxyModule],
})
export class AppModule {}
