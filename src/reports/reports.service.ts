import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateReportDto } from './dto/create-report.dto';
import { PrismaService } from '../prisma.service';
import { PhoneNumberUtil, PhoneNumberFormat } from 'google-libphonenumber';
import type { Multer } from 'multer';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ReportsService {
  private readonly uploadsDir = path.join(
    process.cwd(),
    'uploads',
    'screenshots'
  );

  constructor(private readonly prisma: PrismaService) {
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  async uploadScreenshot(file: Express.Multer.File): Promise<string> {
    if (!file) {
      throw new BadRequestException('Brak pliku do uploadowania');
    }

    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Nieobsługiwany format. Dozwolone: ${allowedMimes.join(', ')}`
      );
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('Plik jest za duży (max 5MB)');
    }

    const timestamp = Date.now();
    const ext = file.mimetype.split('/')[1];
    const filename = `screenshot_${timestamp}_${Math.random()
      .toString(36)
      .substr(2, 9)}.${ext}`;
    const filepath = path.join(this.uploadsDir, filename);

    fs.writeFileSync(filepath, file.buffer);

    return `uploads/screenshots/${filename}`;
  }


  async getStatsForTarget(targetValue: string) {
    const isNip = /^[0-9]{10}$/.test(targetValue);

    const whereCondition = isNip
      ? { companyNip: targetValue }
      : { phoneNumber: targetValue };

    const reports = await this.prisma.report.findMany({
      where: whereCondition,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true } } },
    });

    const negativeCount = reports.filter((r) => r.rating <= 2).length;
    const positiveCount = reports.filter((r) => r.rating >= 4).length;

    return {
      total: reports.length,
      negative: negativeCount,
      positive: positiveCount,
      entries: reports,
    };
  }

  async getLatestGlobal(limit: number = 6) {
    const reports = await this.prisma.report.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        phone: { select: { number: true, trustScore: true } },
        company: { select: { nip: true, name: true, trustScore: true } },
        person: { select: { id: true, name: true } },
      },
    });

    return reports.map((r) => {
      let targetValue = 'Nieznany';
      let targetType = 'OTHER';

      if (r.phoneNumber) {
        targetValue = r.phoneNumber;
        targetType = 'PHONE';
      } else if (r.companyNip) {
        targetValue = r.companyNip;
        targetType = 'NIP';
      } else if (r.personId) {
        targetValue = r.person?.name || 'Osoba';
        targetType = 'PERSON';
      }

      const trustScore = r.phone?.trustScore || r.company?.trustScore || 0;

      return {
        id: r.id,
        targetValue,
        targetType,
        trustScore,
        rating: r.rating,
        reason: r.reason,
        comment: r.comment,
        date: r.createdAt,
      };
    });
  }
}
