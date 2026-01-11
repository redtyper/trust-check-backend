import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { VatService } from './vat.service'; // <--- Import

@Module({
  imports: [HttpModule],
  providers: [VatService], // <--- Dodaj do providers
  exports: [VatService],   // <--- Dodaj do exports
})
export class IntegrationModule {}
