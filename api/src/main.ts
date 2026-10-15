import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter, requestLog } from './common/http-log';
import { FileLogger, flushLogs, LOG_DIR, log } from './common/log';

try {
  process.loadEnvFile(); // .env local (em produção as variáveis vêm do host)
} catch {
  /* sem .env */
}

// erro que escapou de tudo: grava antes de qualquer coisa
process.on('unhandledRejection', (err) => log.error('process.unhandled_rejection', { err }));
process.on('uncaughtException', (err) => {
  log.fatal('process.uncaught_exception', { err });
  void flushLogs().finally(() => process.exit(1));
});

async function bootstrap() {
  const logger = new FileLogger();
  logger.setLogLevels(['log', 'warn', 'error']);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger });
  app.use(requestLog);
  app.useGlobalFilters(new AllExceptionsFilter());
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(compression());
  app.useBodyParser('json', { limit: '1mb' });
  app.enableCors({ origin: (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(','), credentials: true, exposedHeaders: ['x-request-id'] });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3000);
  // sem host = escuta em IPv4 e IPv6 (localhost no Windows resolve pra ::1 primeiro)
  await app.listen(port);
  Logger.log(`Arquibancada no ar em http://localhost:${port}`, 'Boot');
  log.info('boot', { port, node: process.version, env: process.env.NODE_ENV ?? 'development', logDir: LOG_DIR });
}
void bootstrap();
