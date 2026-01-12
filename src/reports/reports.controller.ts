import { Controller, Post, Get, Body, Ip, UseGuards, Request } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { AuthGuard } from '@nestjs/passport'; // <--- Import

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}
   @Get('latest')
  getLatest() {
    return this.reportsService.getLatestGlobal();
  }
  @Post()
  @UseGuards(AuthGuard('jwt')) // <--- WYMAGA LOGOWANIA
  create(@Body() createReportDto: CreateReportDto, @Ip() ip: string, @Request() req: any) {
    // req.user pochodzi z tokena JWT (dzięki JwtStrategy)
    return this.reportsService.create(createReportDto, req.user.userId, ip);
  }
}
