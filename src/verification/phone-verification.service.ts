import { Injectable, BadRequestException } from '@nestjs/common';
import { PhoneNumberUtil, PhoneNumberFormat } from 'google-libphonenumber';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PhoneVerificationService {
  private phoneUtil = PhoneNumberUtil.getInstance();

  constructor(private readonly prisma: PrismaService) {}

  async checkPhone(rawInput: string, countryCode: string = 'PL') {
    let formattedQuery = rawInput;
    let isPhone = false;

    // 1. Parsowanie
    try {
      if (/[a-zA-Z]/.test(rawInput)) {
        throw new Error('Not a phone number');
      }
      const number = this.phoneUtil.parseAndKeepRawInput(rawInput, countryCode);
      if (this.phoneUtil.isValidNumber(number)) {
        formattedQuery = this.phoneUtil.format(number, PhoneNumberFormat.E164);
        isPhone = true;
      } else {
         throw new Error('Invalid number');
      }
    } catch (e) {
      isPhone = false;
      formattedQuery = rawInput; 
    }

    // 2. Pobieranie danych
    let dbEntry: any = null;
    let reports: any[] = [];

    if (isPhone) {
      dbEntry = await this.prisma.phoneNumber.findUnique({
        where: { number: formattedQuery },
        include: { 
          reports: { orderBy: { createdAt: 'desc' } }, 
          company: true 
        },
      });
      reports = dbEntry?.reports || [];
    } else {
      // Osoba
      dbEntry = await this.prisma.person.findFirst({
        where: { name: formattedQuery },
        include: { 
          reports: { orderBy: { createdAt: 'desc' } }
        },
      });
      reports = dbEntry?.reports || [];
    }

    // 3. Kalkulacja
    let trustScore = dbEntry?.trustScore ?? 50;
    let riskLevel = dbEntry?.riskLevel ?? 'Nieznany';
    const negativeReports = reports.filter((r) => r.rating <= 2).length;

    if (!dbEntry) {
      if (negativeReports > 0) {
        trustScore -= negativeReports * 20;
        riskLevel = 'Wysoki';
      } else {
        riskLevel = 'Brak danych';
      }
    } else {
        if (negativeReports > 0 && trustScore === 50) {
             trustScore -= negativeReports * 15;
             riskLevel = 'Podwyższone';
        }
    }
    if (trustScore < 0) trustScore = 0;

    // 4. Return
    return {
      query: formattedQuery,
      isPhone: isPhone, 
      trustScore,
      riskLevel,
      source: dbEntry ? 'DB' : 'None',
      company: isPhone && dbEntry?.company ? {
        name: dbEntry.company.name,
        nip: dbEntry.company.nip,
        vat: dbEntry.company.statusVat,
      } : null,
      community: {
        alerts: negativeReports,
        totalReports: reports.length,
        // TU BYŁ BŁĄD - BRAKOWAŁO PÓL W MAPOWANIU
        latestComments: reports.map((r) => ({
          date: r.createdAt,
          reason: r.reason,
          comment: r.comment,
          rating: r.rating,
          // PEŁNY OSINT ZWRACANY DO FRONTENDU:
          phoneNumber: r.phoneNumber, // <--- KLUCZOWE
          reportedEmail: r.reportedEmail,
          facebookLink: r.facebookLink,
          bankAccount: r.bankAccount,
          screenshotUrl: r.screenshotUrl, 
          screenshotPath: r.screenshotPath, 
        })),
      },
    };
  }
}
