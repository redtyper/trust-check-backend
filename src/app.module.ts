import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VerificationModule } from './verification/verification.module';
import { IntegrationModule } from './integration/integration.module';
import { ReportsModule } from './reports/reports.module';
import { PrismaModule } from './prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    VerificationModule,
    IntegrationModule,
    ReportsModule,
  ],
})
export class AppModule {}
