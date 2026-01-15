import { Injectable } from '@nestjs/common';
import { PhoneNumberUtil, PhoneNumberFormat, PhoneNumber } from 'google-libphonenumber';
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

    // 2. Pobieranie danych (POPRAWIONE ŁĄCZENIE ŹRÓDEŁ)
    let dbPhoneEntry: any = null;
    let dbPersonEntry: any = null;
    let company: any = null;
    let phoneReports: any[] = [];
    let personReports: any[] = [];

    if (isPhone) {
      // A. Pobierz raporty przypisane bezpośrednio do numeru telefonu (FK phoneNumber)
      dbPhoneEntry = await this.prisma.phoneNumber.findUnique({
        where: { number: formattedQuery },
        include: { 
          reports: { orderBy: { createdAt: 'desc' } }, 
          company: true 
        },
      });
      if (dbPhoneEntry) {
          phoneReports = dbPhoneEntry.reports;
          company = dbPhoneEntry.company;
      }

      // B. Pobierz raporty przypisane do Osoby o takiej nazwie (dla przypadków gdy targetType=PERSON a targetValue=Telefon)
      // To naprawia problem znikających raportów przy podaniu innego numeru kontaktowego (OSINT)
      dbPersonEntry = await this.prisma.person.findFirst({
         where: { name: formattedQuery },
         include: { reports: { orderBy: { createdAt: 'desc' } } }
      });
      if (dbPersonEntry) {
          personReports = dbPersonEntry.reports;
      }
    } else {
      // Logika dla zwykłej osoby (nie-telefonu)
      dbPersonEntry = await this.prisma.person.findFirst({
        where: { name: formattedQuery },
        include: { 
          reports: { orderBy: { createdAt: 'desc' } }
        },
      });
      if (dbPersonEntry) personReports = dbPersonEntry.reports;
    }

    // Łączenie i sortowanie raportów (usuwanie duplikatów po ID)
    const allReports = [...phoneReports, ...personReports].filter(
        (obj, index, self) => index === self.findIndex((t) => t.id === obj.id)
    ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // 3. Kalkulacja statystyk
    // Bierzemy TrustScore z tabeli PhoneNumber (priorytet) lub Person
    let trustScore = dbPhoneEntry?.trustScore ?? dbPersonEntry?.trustScore ?? 50;
    let riskLevel = dbPhoneEntry?.riskLevel ?? dbPersonEntry?.riskLevel ?? 'Nieznany';
    
    // Jeśli brak wpisu w bazie, ale są raporty - oblicz dynamicznie
    const negativeReports = allReports.filter((r) => r.rating <= 2).length;
    const existsInDb = !!dbPhoneEntry || !!dbPersonEntry;

    if (!existsInDb) {
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
      source: existsInDb ? 'DB' : 'None',
      company: company ? {
        name: company.name,
        nip: company.nip,
        vat: company.statusVat,
      } : null,
      community: {
        alerts: negativeReports,
        totalReports: allReports.length,
        // MAPOWANIE Z PEŁNYM OSINTEM
        latestComments: allReports.map((r) => ({
           date: r.createdAt,
          reason: r.reason,
          comment: r.comment,
          rating: r.rating,
          // --- DODAJ TE DWIE LINIJKI ---
          phoneNumber: r.phoneNumber,
          bankAccount: r.bankAccount,
          // -----------------------------
          reportedEmail: r.reportedEmail,
          facebookLink: r.facebookLink,
          screenshotUrl: r.screenshotUrl,
          screenshotPath: r.screenshotPath,
        })),
      },
    };
  }
}
