import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VerificationModule } from './verification/verification.module';
import { IntegrationModule } from './integration/integration.module';
import { ReportsModule } from './reports/reports.module';
import { PrismaModule } from './prisma.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    VerificationModule,
    IntegrationModule,
    ReportsModule,
    AuthModule,
  ],
})
export class AppModule {}
