import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // Dzięki temu Prisma jest dostępna wszędzie bez importowania
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
