import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // --- DODAJ TĘ LINIJKĘ ---
  app.enableCors(); 
  // To pozwala każdemu (w tym Next.js) pytać o dane.
  // ------------------------

  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
  }));
  
  await app.listen(3000);
}
bootstrap();
