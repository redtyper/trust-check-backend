import { Module, Logger } from '@nestjs/common';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';
import { PhoneVerificationService } from './phone-verification.service';
import { IntegrationModule } from '../integration/integration.module';
import { ReportsModule } from '../reports/reports.module';

/**
 * Verification Module
 *
 * Handles company and person verification:
 * - Company verification via VAT API (live and cached data)
 * - Phone number verification and trust scoring
 * - Trust score calculation based on VAT status and community reports
 * - Admin management of companies and persons
 *
 * Imports:
 * - IntegrationModule: For VAT service integration
 * - ReportsModule: For community report statistics
 *
 * Services:
 * - VerificationService: Core verification logic
 * - PhoneVerificationService: Phone-specific verification
 *
 * Controllers:
 * - VerificationController: Public and admin endpoints
 */
@Module({
  imports: [IntegrationModule, ReportsModule],
  controllers: [VerificationController],
  providers: [VerificationService, PhoneVerificationService, Logger],
  exports: [VerificationService, PhoneVerificationService],
})
export class VerificationModule {}
