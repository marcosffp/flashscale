import { HttpService } from '@nestjs/axios';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import { AuthenticatedRequest } from '../auth/authenticated-request';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';

// Nunca repassados pra api: 'authorization' é o JWT do próprio gateway (a api
// confia só no X-User-Id/X-User-Sub internos, negocio.md §3); os demais são
// metadados de transporte da requisição original que não fazem sentido reenviados.
const HEADERS_NAO_PROPAGADOS = new Set(['host', 'connection', 'content-length', 'authorization']);

// Mensagem exata do negocio.md §9 — o usuário vê isso em vez de esperar o
// timeout completo quando o circuito está aberto.
const MENSAGEM_CIRCUITO_ABERTO = 'Alta demanda no momento, tente novamente em instantes.';

@Injectable()
export class ProxyService {
  constructor(
    private readonly httpService: HttpService,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  async encaminhar(request: AuthenticatedRequest): Promise<AxiosResponse> {
    if (!this.circuitBreaker.podeProsseguir()) {
      throw new ServiceUnavailableException(MENSAGEM_CIRCUITO_ABERTO);
    }

    const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:3001';

    try {
      const resposta = await firstValueFrom(
        this.httpService.request({
          method: request.method,
          url: `${apiBaseUrl}${request.originalUrl}`,
          data: request.body,
          headers: this.construirHeaders(request),
          validateStatus: () => true,
        }),
      );

      if (resposta.status >= 500) {
        this.circuitBreaker.registrarFalha();
      } else {
        this.circuitBreaker.registrarSucesso();
      }

      return resposta;
    } catch (erro) {
      this.circuitBreaker.registrarFalha();
      throw erro;
    }
  }

  private construirHeaders(request: AuthenticatedRequest): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const [nome, valor] of Object.entries(request.headers)) {
      if (typeof valor === 'string' && !HEADERS_NAO_PROPAGADOS.has(nome.toLowerCase())) {
        headers[nome] = valor;
      }
    }

    headers['X-User-Id'] = request.user.id;
    headers['X-User-Sub'] = request.user.sub;

    return headers;
  }
}
