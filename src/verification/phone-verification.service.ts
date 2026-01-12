import { Injectable, BadRequestException } from '@nestjs/common';
import { PhoneNumberUtil, PhoneNumberFormat } from 'google-libphonenumber';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PhoneVerificationService {
  private phoneUtil = PhoneNumberUtil.getInstance();

  constructor(private readonly prisma: PrismaService) {}

  async checkPhone(rawNumber: string, countryCode: string = 'PL') {
    let formattedNumber: string;
    let detectedCountry: string = 'XX';

    try {
      const number = this.phoneUtil.parseAndKeepRawInput(rawNumber, countryCode);
      if (!this.phoneUtil.isValidNumber(number)) throw new Error('Invalid');
      formattedNumber = this.phoneUtil.format(number, PhoneNumberFormat.E164);
      detectedCountry = this.phoneUtil.getRegionCodeForNumber(number) || 'Nieznany';
    } catch (e) {
      throw new BadRequestException(`Niepoprawny numer telefonu: ${rawNumber}`);
    }

    const db: any = this.prisma;
    // Pobieramy numer wraz z raportami
    let phoneEntry = await db.phoneNumber.findUnique({
      where: { number: formattedNumber },
      include: {
        reports: {
            orderBy: { createdAt: 'desc' },
            take: 20 // Pobierz więcej raportów
        },
        company: true
      }
    });

    // Kalkulacja TrustScore
    let trustScore = phoneEntry ? phoneEntry.trustScore : 50; 
    let riskLevel = 'Średni (Brak danych)';

    const reports = phoneEntry?.reports || [];
    const negativeReports = reports.filter(r => r.rating <= 2).length;

    if (negativeReports > 0) {
      trustScore -= (negativeReports * 20);
      riskLevel = 'Wysoki (Zgłoszenia)';
    } else if (phoneEntry?.company) {
      trustScore += 20; 
      riskLevel = 'Niski (Zweryfikowany Firma)';
    }
    if (trustScore < 0) trustScore = 0;

    // === FIX: ZWRACANIE STRUKTURY ZGODNEJ Z FRONTENDEM ===
    return {
      query: formattedNumber, // Zwracamy sformatowany numer jako główny
      trustScore,
      riskLevel,
      source: 'DB',
      
      // Dane Firmy (jeśli połączony)
      company: phoneEntry?.company ? {
          name: phoneEntry.company.name,
          nip: phoneEntry.company.nip,
          vat: phoneEntry.company.statusVat
      } : null,

      // Dane Społeczności (To naprawia wyświetlanie raportów!)
      community: {
          alerts: negativeReports,
          totalReports: reports.length,
          latestComments: reports.map(r => ({
              date: r.createdAt,
              reason: r.reason,
              comment: r.comment,
              rating: r.rating,
              reportedEmail: r.reportedEmail,
              facebookLink: r.facebookLink,
              screenshotUrl: r.screenshotUrl
          }))
      }
    };
  }
}
