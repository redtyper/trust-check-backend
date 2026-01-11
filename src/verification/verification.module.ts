import { Module } from '@nestjs/common';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';
import { PhoneVerificationService } from './phone-verification.service'; // <--- Import
import { IntegrationModule } from '../integration/integration.module';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [IntegrationModule, ReportsModule],
  controllers: [VerificationController],
  providers: [
    VerificationService, 
    PhoneVerificationService // <--- DODAJ TĘ LINIJKĘ
  ], 
})
export class VerificationModule {}
