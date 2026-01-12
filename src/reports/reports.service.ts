import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateReportDto } from './dto/create-report.dto';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateReportDto, userId: number, ip: string) {
    const reportData: any = {
      rating: dto.rating,
      reason: dto.reason,
      comment: dto.comment,
      ipAddress: ip,
      user: { connect: { id: userId } },
      // Przypisz nowe pola (jeśli istnieją)
      reportedEmail: dto.reportedEmail,
      facebookLink: dto.facebookLink,
      screenshotUrl: dto.screenshotUrl,
    };

    if (dto.targetType === 'NIP') {
         // ... logika NIP
         reportData.company = { connect: { nip: dto.targetValue } };
    } 
    // OBSŁUGA OBU TYPÓW DLA TELEFONU:
    else if (dto.targetType === 'PHONE' || dto.targetType === 'PERSON') {
         
         // Upewnij się, że targetValue to numer telefonu!
         // Jeśli to PERSON, frontend może wysłać np. imię w innym polu, ale targetValue musi być numerem.
         
         // 1. Zapisz/Znajdź numer w bazie
         await this.prisma.phoneNumber.upsert({
             where: { number: dto.targetValue },
             create: { 
                 number: dto.targetValue, 
                 countryCode: 'PL',
                 trustScore: 50 // Domyślny score
             },
             update: {} // Nic nie zmieniaj jak istnieje
         });

         // 2. Podłącz raport do tego numeru
         reportData.phone = { connect: { number: dto.targetValue } };
    } 
    else {
         throw new BadRequestException(`Nieobsługiwany typ: ${dto.targetType}`);
    }

    return this.prisma.report.create({ data: reportData });
}

  // ... (reszta pliku getStatsForTarget bez zmian)


  // Metoda pomocnicza dla modułu weryfikacji
  async getStatsForTarget(targetValue: string) {
    const isNip = /^\d{10}$/.test(targetValue);
    
    const whereCondition = isNip 
        ? { companyNip: targetValue } 
        : { phoneNumber: targetValue };

    const reports = await this.prisma.report.findMany({
      where: whereCondition,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true } } } // Opcjonalnie: pobierz email zgłaszającego
    });

    const negativeCount = reports.filter(r => r.rating <= 2).length;
    const positiveCount = reports.filter(r => r.rating >= 4).length;

    return {
      total: reports.length,
      negative: negativeCount,
      positive: positiveCount,
      entries: reports
    };
  }
}
