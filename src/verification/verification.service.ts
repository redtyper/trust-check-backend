import { Injectable } from '@nestjs/common';
import { VatService } from '../integration/vat.service';
import { PrismaService } from '../prisma.service';
import { ReportsService } from '../reports/reports.service';
import { Company } from '@prisma/client';

@Injectable()
export class VerificationService {
  constructor(
    private readonly vatService: VatService,
    private readonly prisma: PrismaService,
    private readonly reportsService: ReportsService,
  ) {}

  // === METODA SEARCH (To jej brakowało!) ===
  async search(query: string) {
    const cleanQuery = query.replace(/[^a-zA-Z0-9]/g, '');

    // Detekcja typu
    let type = 'UNKNOWN';
    if (/^\d{10}$/.test(cleanQuery)) type = 'NIP';
    else if (/^\d{9}$/.test(cleanQuery)) type = 'PHONE';
    else if (/^48\d{9}$/.test(cleanQuery)) type = 'PHONE';

    // Logika NIP
    if (type === 'NIP') {
      return this.verifyCompany(cleanQuery);
    }
    
    // Logika Telefon
    if (type === 'PHONE') {
        // Zwracamy info dla frontendu, żeby przekierował na /report/phone/...
        return { type: 'PHONE', query: cleanQuery };
    }

    return { error: 'Niepoprawny format. Wpisz NIP (10 cyfr) lub Telefon.' };
  }

  // === GŁÓWNA LOGIKA WERYFIKACJI FIRMY ===
  async verifyCompany(nip: string) {
    const reportStats = await this.reportsService.getStatsForTarget(nip);
    
    // Pobierz z bazy (WRAZ Z TELEFONAMI!)
    const cachedCompany = await this.prisma.company.findUnique({
      where: { nip },
      include: { phones: true } // <--- Ważne dla wyświetlania telefonów
    });

    const ONE_DAY = 24 * 60 * 60 * 1000;
    const isFresh = cachedCompany && (Date.now() - cachedCompany.updatedAt.getTime() < ONE_DAY);

    let baseTrustScore = 0;
    let companyData: Company | null = null;
    let source = '';
    let phones = cachedCompany?.phones || [];

    if (isFresh) {
      // CACHE
      companyData = cachedCompany;
      baseTrustScore = cachedCompany.trustScore;
      source = 'CACHE_DB';
    } else {
      // API
      const vatData = await this.vatService.checkVatStatus(nip);
      source = 'LIVE_API';

      if (vatData.found) {
        baseTrustScore += 30;
        if (vatData.statusVat === 'Czynny') baseTrustScore += 40;
        if (vatData.accountNumbers?.length > 0) baseTrustScore += 20;

        const saved = await this.prisma.company.upsert({
          where: { nip },
          update: {
            name: vatData.name,
            statusVat: vatData.statusVat,
            trustScore: baseTrustScore,
            riskLevel: this.calculateRisk(baseTrustScore),
            rawData: vatData as any,
          },
          create: {
            nip: vatData.nip,
            name: vatData.name,
            statusVat: vatData.statusVat,
            trustScore: baseTrustScore,
            riskLevel: this.calculateRisk(baseTrustScore),
            rawData: vatData as any,
          },
        });
        companyData = saved;
      } else {
        return {
           query: nip,
           trustScore: 0,
           riskLevel: 'Krytyczny (Nie istnieje)',
           source: 'LIVE_API'
        }
      }
    }

    // Kalkulacja końcowa
    let finalTrustScore = baseTrustScore;
    if (reportStats.negative > 0) {
      finalTrustScore -= (reportStats.negative * 15);
    }
    if (finalTrustScore < 0) finalTrustScore = 0;

    return {
      query: nip,
      trustScore: finalTrustScore,
      riskLevel: this.calculateRisk(finalTrustScore),
      source: source,
      company: {
        name: companyData ? companyData.name : 'Brak danych',
        vat: companyData ? companyData.statusVat : 'Nieznany',
        phones: phones // Przekazujemy telefony do frontendu
      },
      community: {
        alerts: reportStats.negative,
        totalReports: reportStats.total,
        latestComments: reportStats.entries.slice(-3)
      }
    };
  }

  // === METODY ADMINISTRACYJNE (CRUD) ===

  async getAllCompanies() {
    return this.prisma.company.findMany({
      select: { nip: true, name: true, statusVat: true, riskLevel: true },
      take: 100,
      orderBy: { createdAt: 'desc' }
    });
  }

  async getCompanyForAdmin(nip: string) {
    return this.prisma.company.findUnique({
      where: { nip },
      include: { phones: true }
    });
  }

  async updateCompany(nip: string, data: any) {
    const { phones, ...companyData } = data;
    return this.prisma.company.update({
      where: { nip },
      data: {
        name: companyData.name,
        trustScore: Number(companyData.trustScore),
        riskLevel: companyData.riskLevel,
        statusVat: companyData.statusVat
      }
    });
  }

  async linkPhoneToCompany(nip: string, phoneNumber: string) {
    const company = await this.prisma.company.findUnique({ where: { nip } });
    if (!company) {
       await this.prisma.company.create({
         data: {
           nip,
           name: 'Firma Dodana Ręcznie',
           statusVat: 'Nieznany',
           trustScore: 50,
           riskLevel: 'Nieznany'
         }
       });
    }

    return this.prisma.phoneNumber.upsert({
      where: { number: phoneNumber },
      update: { companyNip: nip, trustScore: 70 },
      create: { number: phoneNumber, countryCode: 'PL', companyNip: nip, trustScore: 70 }
    });
  }

  // Pomocnicza
  private calculateRisk(score: number): string {
    if (score >= 80) return 'Bardzo Niski';
    if (score >= 50) return 'Średni';
    if (score >= 20) return 'Wysoki';
    return 'Krytyczny';
  }
}
