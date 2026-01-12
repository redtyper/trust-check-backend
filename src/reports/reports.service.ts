import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateReportDto } from './dto/create-report.dto';
import { PrismaService } from '../prisma.service';
import { PhoneNumberUtil, PhoneNumberFormat } from 'google-libphonenumber'; // <--- DODAJ IMPORT

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
      reportedEmail: dto.reportedEmail,
      facebookLink: dto.facebookLink,
      screenshotUrl: dto.screenshotUrl,
    };

    if (dto.targetType === 'NIP') {
         reportData.company = { connect: { nip: dto.targetValue } };
    } 
    else if (dto.targetType === 'PHONE' || dto.targetType === 'PERSON') {
         // === FIX: NORMALIZACJA NUMERU ===
         let finalNumber = dto.targetValue;
         try {
            const phoneUtil = PhoneNumberUtil.getInstance();
            // Próbujemy parsować numer zakładając PL jeśli brak plusa
            const numberObj = phoneUtil.parseAndKeepRawInput(dto.targetValue, 'PL');
            if (phoneUtil.isValidNumber(numberObj)) {
                finalNumber = phoneUtil.format(numberObj, PhoneNumberFormat.E164);
            }
         } catch (e) {
            console.warn('Nie udało się znormalizować numeru przy zapisie:', dto.targetValue);
         }
         // =================================

         await this.prisma.phoneNumber.upsert({
             where: { number: finalNumber },
             create: { 
                 number: finalNumber, 
                 countryCode: 'PL',
                 trustScore: 50
             },
             update: {}
         });

         reportData.phone = { connect: { number: finalNumber } };
    } 
    else {
         throw new BadRequestException(`Nieobsługiwany typ: ${dto.targetType}`);
    }

    return this.prisma.report.create({ data: reportData });
  }

  // ... reszta pliku bez zmian (getStatsForTarget)
   async getStatsForTarget(targetValue: string) {
    const isNip = /^\d{10}$/.test(targetValue);
    
    // Tutaj też przydałaby się normalizacja dla pewności, ale
    // zazwyczaj ta metoda jest wołana z już znormalizowanym numerem przez serwisy weryfikacji.
    
    const whereCondition = isNip 
        ? { companyNip: targetValue } 
        : { phoneNumber: targetValue };

    const reports = await this.prisma.report.findMany({
      where: whereCondition,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true } } }
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
  async getLatestGlobal(limit: number = 6) {
    const reports = await this.prisma.report.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        // Pobieramy powiązania, żeby wiedzieć CZEGO dotyczy zgłoszenie
        include: { 
            phone: { select: { number: true, trustScore: true } },
            company: { select: { nip: true, name: true, trustScore: true } }
        }
    });

    // Formatujemy dane dla frontendu
    return reports.map(r => {
        // Ustalamy cel zgłoszenia
        const targetValue = r.phoneNumber || r.companyNip || 'Nieznany';
        const targetType = r.companyNip ? 'NIP' : 'PHONE';
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
            city: 'Polska' // Opcjonalnie (jeśli kiedyś dodasz geo-ip)
        };
    });
}
}
