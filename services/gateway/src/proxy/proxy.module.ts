import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { CircuitBreakerModule } from '../circuit-breaker/circuit-breaker.module';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';

@Module({
  imports: [HttpModule, CircuitBreakerModule],
  controllers: [ProxyController],
  providers: [ProxyService],
})
export class ProxyModule {}
