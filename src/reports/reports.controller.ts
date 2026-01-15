import {
  Controller,
  Get,
  Post,
  Body,
  Ip,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  InternalServerErrorException,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { AuthGuard } from '@nestjs/passport';
import type { Express } from 'express';

/**
 * Response DTO for successful report creation
 */
interface CreateReportResponse {
  id: string;
  message: string;
}

/**
 * Response DTO for screenshot upload
 */
interface UploadScreenshotResponse {
  path: string;
  url: string;
}

/**
 * Response DTO for latest reports
 */
interface GetLatestReportsResponse {
  reports: any[];
  total: number;
}

@Controller('reports')
export class ReportsController {
  private readonly logger = new Logger(ReportsController.name);

  constructor(private readonly reportsService: ReportsService) {}

  /**
   * Get latest global reports
   * @returns List of latest reports
   */
  @Get('latest')
  @HttpCode(HttpStatus.OK)
  async getLatest(): Promise<GetLatestReportsResponse> {
    this.logger.log('Fetching latest global reports');
    try {
      const reports = await this.reportsService.getLatestGlobal();
      return {
        reports,
        total: reports?.length || 0,
      };
    } catch (error) {
      this.logger.error('Error fetching latest reports', error);
      throw new InternalServerErrorException('Failed to fetch reports');
    }
  }

  /**
   * Create a new report
   * @param createReportDto Report data
   * @param ip Client IP address
   * @param req Express request object
   * @returns Created report information
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard('jwt'))
  async create(
    @Body() createReportDto: CreateReportDto,
    @Ip() ip: string,
    @Request() req: any,
  ): Promise<CreateReportResponse> {
    if (!req?.user?.userId) {
      this.logger.warn('Unauthorized report creation attempt');
      throw new BadRequestException('Invalid user context');
    }

    this.logger.log(
      `Creating report for user ${req.user.userId} from IP ${ip}`,
    );

    try {
      const result = await this.reportsService.create(
        createReportDto,
        req.user.userId,
        ip,
      );
      return {
        id: result?.id || '',
        message: 'Report created successfully',
      };
    } catch (error) {
      this.logger.error(
        `Error creating report for user ${req.user.userId}`,
        error,
      );
      throw new InternalServerErrorException('Failed to create report');
    }
  }

  /**
   * Upload screenshot for a report
   * @param file Uploaded file
   * @param req Express request object
   * @returns File path and URL
   */
  @Post('upload-screenshot')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file'))
  async uploadScreenshot(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ): Promise<UploadScreenshotResponse> {
    if (!file) {
      this.logger.warn(
        `Screenshot upload attempt without file by user ${req?.user?.userId}`,
      );
      throw new BadRequestException('No file provided for upload');
    }

    if (!req?.user?.userId) {
      this.logger.warn('Unauthorized screenshot upload attempt');
      throw new BadRequestException('Invalid user context');
    }

    this.logger.log(
      `Uploading screenshot (${file.size} bytes) for user ${req.user.userId}`,
    );

    try {
      const result = await this.reportsService.uploadScreenshot(file);

      const baseUrl = process.env.BACKEND_URL || 'http://localhost:3001';
      return {
        path: result,
        url: `${baseUrl}${result}`,
      };
    } catch (error) {
      this.logger.error(
        `Error uploading screenshot for user ${req.user.userId}`,
        error,
      );
      throw new InternalServerErrorException('Failed to upload screenshot');
    }
  }
}
