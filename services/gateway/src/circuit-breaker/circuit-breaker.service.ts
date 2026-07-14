import { Injectable } from '@nestjs/common';

export type CircuitState = 'fechado' | 'aberto' | 'meio-aberto';

// Gatilhos exatos do negocio.md §9 — não são "defaults razoáveis", são a
// definição do comportamento que a demo ao vivo depende de ser previsível.
const LIMITE_FALHAS_CONSECUTIVAS = 5;
const JANELA_FALHAS_MS = 10_000;
const DURACAO_ABERTO_MS = 5_000;

@Injectable()
export class CircuitBreakerService {
  private state: CircuitState = 'fechado';
  private falhas: number[] = [];
  private timerMeioAberto?: NodeJS.Timeout;
  private requisicaoDeTesteEmVoo = false;

  getState(): CircuitState {
    return this.state;
  }

  // Chamado antes de encaminhar cada requisição pra api. Em meio-aberto,
  // deixa passar exatamente 1 requisição de teste — as demais recebem 503
  // até essa única requisição terminar (sucesso fecha, falha reabre).
  podeProsseguir(): boolean {
    if (this.state === 'fechado') return true;
    if (this.state === 'aberto') return false;

    if (this.requisicaoDeTesteEmVoo) return false;
    this.requisicaoDeTesteEmVoo = true;
    return true;
  }

  registrarSucesso(): void {
    if (this.state === 'meio-aberto') {
      this.fechar();
      return;
    }
    this.falhas = [];
  }

  registrarFalha(): void {
    if (this.state === 'meio-aberto') {
      this.abrir();
      return;
    }

    const agora = Date.now();
    this.falhas = this.falhas.filter((timestamp) => agora - timestamp < JANELA_FALHAS_MS);
    this.falhas.push(agora);

    if (this.falhas.length >= LIMITE_FALHAS_CONSECUTIVAS) {
      this.abrir();
    }
  }

  private abrir(): void {
    this.state = 'aberto';
    this.falhas = [];
    this.requisicaoDeTesteEmVoo = false;
    clearTimeout(this.timerMeioAberto);
    this.timerMeioAberto = setTimeout(() => {
      this.state = 'meio-aberto';
    }, DURACAO_ABERTO_MS);
    // unref: esse timer não deve sozinho segurar o processo vivo (o listener
    // HTTP já faz isso) — sem isso, testes que abrem o circuito e não
    // avançam o relógio ficam com o processo pendurado por 5s.
    this.timerMeioAberto.unref?.();
  }

  private fechar(): void {
    this.state = 'fechado';
    this.falhas = [];
    this.requisicaoDeTesteEmVoo = false;
    clearTimeout(this.timerMeioAberto);
  }
}
