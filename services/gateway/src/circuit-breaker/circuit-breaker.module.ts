import { Module } from '@nestjs/common';
import { CircuitBreakerController } from './circuit-breaker.controller';
import { CircuitBreakerService } from './circuit-breaker.service';

@Module({
  controllers: [CircuitBreakerController],
  providers: [CircuitBreakerService],
  exports: [CircuitBreakerService],
})
export class CircuitBreakerModule {}
