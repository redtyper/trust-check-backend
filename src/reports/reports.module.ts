import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [
    MulterModule.register({
      storage: require('multer').memoryStorage(), // Buffer, nie dysk
    }),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
