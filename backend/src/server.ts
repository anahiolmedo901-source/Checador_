import { createApp } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { displayGateway } from './services/display-gateway.service';
import { liveFeedService } from './services/live-feed.service';

const app = createApp();

const server = app.listen(env.port, () => {
  logger.info(`API Checador escuchando en http://localhost:${env.port} (${env.nodeEnv})`);
  displayGateway.attach(server);
  logger.info('Gateway de Smart Displays activo en /api/displays/ws');
});

displayGateway.on('check', (payload) => {
  liveFeedService.writeEvent('check', payload);
});

function shutdown(signal: string): void {
  logger.info(`Recibido ${signal}; cerrando servidor…`);
  server.close(() => {
    logger.info('Servidor cerrado.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandledRejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaughtException');
});