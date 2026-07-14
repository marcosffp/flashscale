import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Etapa 8: o dashboard chama POST /pods/kill direto do browser (negocio.md
  // §5.1, botão "matar pod") — mesma simplificação de MVP já aceita no
  // gateway pro botão "Disparar carga".
  app.enableCors();
  // WsAdapter (WebSocket puro, sem Socket.IO) pra permitir conectar com um
  // client manual como wscat, conforme o critério de pronto da etapa 5.
  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableShutdownHooks();
  const port = process.env.ORCHESTRATOR_PORT ?? 3002;
  await app.listen(port);
}

bootstrap();
