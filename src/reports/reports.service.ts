import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateReportDto } from './dto/create-report.dto';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateReportDto, ip: string) {
    // 1. Przygotuj dane do zapisu
    const reportData: any = {
      rating: dto.rating,
      reason: dto.reason,
      comment: dto.comment,
      ipAddress: ip,
    };

    // 2. Logika warunkowa: NIP czy Telefon?
    if (dto.targetType === 'NIP') {
      // Podpinamy pod firmę (musi istnieć - tutaj upraszczamy, że user zgłasza NIP)
      // W wersji PRO powinniśmy najpierw sprawdzić czy firma istnieje w tabeli Company.
      // Ale żeby MVP działało, zakładamy optymistycznie:
      
      // Upsert dummy company if not exists (żeby klucz obcy zadziałał)
      await this.prisma.company.upsert({
          where: { nip: dto.targetValue },
          create: { nip: dto.targetValue, name: 'Zgłoszona przez Usera', statusVat: 'Nieznany', trustScore: 50, riskLevel: 'Nieznany' },
          update: {} 
      });

      reportData.company = { connect: { nip: dto.targetValue } };

    } else if (dto.targetType === 'PHONE') {
      // Podpinamy pod telefon
      // Musimy najpierw utworzyć numer w bazie, jeśli go nie ma!
      await this.prisma.phoneNumber.upsert({
          where: { number: dto.targetValue },
          create: { number: dto.targetValue, countryCode: 'XX' },
          update: {}
      });

      reportData.phone = { connect: { number: dto.targetValue } };
    } else {
        throw new BadRequestException('Nieobsługiwany typ zgłoszenia');
    }

    return this.prisma.report.create({
      data: reportData,
    });
  }

  // Metoda pomocnicza dla modułu weryfikacji
  async getStatsForTarget(targetValue: string) {
    // Tutaj musimy sprawdzić, czy szukamy po NIP czy po Telefonie
    // Uproszczenie: Jeśli ma 10 cyfr to NIP, inaczej Telefon (lub sprawdzamy oba pola)
    
    const isNip = /^\d{10}$/.test(targetValue);
    
    const whereCondition = isNip 
        ? { companyNip: targetValue } 
        : { phoneNumber: targetValue };

    const reports = await this.prisma.report.findMany({
      where: whereCondition,
      orderBy: { createdAt: 'desc' }
    });

    const negativeCount = reports.filter(r => r.rating <= 2).length;
    const positiveCount = reports.filter(r => r.rating >= 4).length;

    return {
      total: reports.length,
      negative: negativeCount,
      positive: positiveCount,
      entries: reports // zwracamy też listę
    };
  }
}
