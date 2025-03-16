import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

class CustomIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: '*',
        credentials: true,
      },
      allowEIO3: true, // For older clients
    });

    // Add connection state handling
    server.on('connection', (socket) => {
      socket.on('error', (err) => {
        console.error('Socket error:', err);
      });
    });

    return server;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Set CORS for HTTP routes
  app.enableCors({
    origin: ['http://localhost:5000',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5000'], // Frontend origin
    credentials: true,
  });

  app.useWebSocketAdapter(new CustomIoAdapter(app));
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
