import { Controller, Post, Body, Ip } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  create(@Body() createReportDto: CreateReportDto, @Ip() ip: string) {
    return this.reportsService.create(createReportDto, ip);
  }
}
