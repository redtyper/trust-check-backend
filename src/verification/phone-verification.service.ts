import { Injectable, BadRequestException } from '@nestjs/common';
import { PhoneNumberUtil, PhoneNumberFormat } from 'google-libphonenumber';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PhoneVerificationService {
  private phoneUtil = PhoneNumberUtil.getInstance();

  constructor(private readonly prisma: PrismaService) {}

  async checkPhone(rawNumber: string, countryCode: string = 'PL') {
    // 1. Standaryzacja numeru (Google Lib)
 let formattedNumber: string;
    let detectedCountry: string = 'XX'; // Wartość domyślna (Nieznany)

    try {
      const number = this.phoneUtil.parseAndKeepRawInput(rawNumber, countryCode);
      
      if (!this.phoneUtil.isValidNumber(number)) {
        throw new Error('Numer nieprawidłowy');
      }

      formattedNumber = this.phoneUtil.format(number, PhoneNumberFormat.E164);
      
      // POPRAWKA: Obsługa undefined
      const regionCode = this.phoneUtil.getRegionCodeForNumber(number);
      detectedCountry = regionCode || 'Nieznany'; // Jeśli undefined, wpisz "Nieznany"

    } catch (e) {
      throw new BadRequestException(`Niepoprawny numer telefonu: ${rawNumber}`);
    }

    // 2. Pobierz dane z bazy (Wraz ze zgłoszeniami i ew. firmą)
    const db: any = this.prisma;
    let phoneEntry = await db.phoneNumber.findUnique({
      where: { number: formattedNumber },
      include: {
        reports: {
            orderBy: { createdAt: 'desc' },
            take: 5
        },
        company: true // Jeśli numer jest powiązany z firmą, pobierz ją!
      }
    });

    // 3. Kalkulacja TrustScore
    let trustScore = phoneEntry ? phoneEntry.trustScore : 50; // Startujemy od 50 (Neutralny)
    let riskLevel = 'Średni (Brak danych)';

    // Policz negatywy
    const reports = phoneEntry?.reports || [];
    const negativeReports = reports.filter(r => r.rating <= 2).length;

    if (negativeReports > 0) {
      trustScore -= (negativeReports * 20);
      riskLevel = 'Wysoki (Zgłoszenia)';
    } else if (phoneEntry?.company) {
      // Jeśli numer jest oficjalnie przypisany do firmy, rośnie zaufanie
      trustScore += 20; 
      riskLevel = 'Niski (Zweryfikowany Firma)';
    }

    if (trustScore < 0) trustScore = 0;

    return {
      query: rawNumber,
      formatted: formattedNumber,
      country: detectedCountry,
      trustScore,
      riskLevel,
      isLinkedToCompany: !!phoneEntry?.company,
      companyData: phoneEntry?.company ? {
          name: phoneEntry.company.name,
          nip: phoneEntry.company.nip
      } : null,
      reports: reports
    };
  }
}
