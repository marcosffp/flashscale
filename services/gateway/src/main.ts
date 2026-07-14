import 'dotenv/config';
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Etapa 7: o dashboard dispara carga direto do browser contra o gateway
  // (negocio.md §8, botão "Disparar carga"), então precisa de CORS liberado
  // — mesma simplificação de MVP já aceita pro login sem senha.
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();
  const port = process.env.GATEWAY_PORT ?? 3000;
  await app.listen(port);
}

bootstrap();
