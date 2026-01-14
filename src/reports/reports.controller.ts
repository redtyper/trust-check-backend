import {
  Controller,
  Post,
  Get,
  Body,
  Ip,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { AuthGuard } from '@nestjs/passport';
import type { Express } from 'express';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('latest')
  getLatest() {
    return this.reportsService.getLatestGlobal();
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(
    @Body() createReportDto: CreateReportDto,
    @Ip() ip: string,
    @Request() req: any
  ) {
    return this.reportsService.create(createReportDto, req.user.userId, ip);
  }

  @Post('upload-screenshot')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file'))
  async uploadScreenshot(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any
  ) {
    if (!file) {
      throw new BadRequestException('Brak pliku do uploadowania');
    }
    
    const result = await this.reportsService.uploadScreenshot(file);
    return {
      path: result,
      url: `${process.env.BACKEND_URL || 'http://localhost:3001'}/${result}`,
    };
  }
}
