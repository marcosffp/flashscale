import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { CircuitBreakerService } from './circuit-breaker.service';
import { CircuitBreakerStatusDto } from './dto/circuit-breaker-status.dto';

@Controller('circuit-breaker')
export class CircuitBreakerController {
  constructor(private readonly circuitBreaker: CircuitBreakerService) {}

  // Público: o dashboard consulta esse endpoint direto do browser, sem JWT
  // (mesma simplificação de MVP já aceita pro CORS liberado do LoadTestPanel).
  @Public()
  @Get('status')
  status(): CircuitBreakerStatusDto {
    return { state: this.circuitBreaker.getState() };
  }
}
