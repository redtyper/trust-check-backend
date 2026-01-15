import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { VatService } from '../integration/vat.service';
import { PrismaService } from '../prisma.service';
import { ReportsService } from '../reports/reports.service';
import { Company } from '@prisma/client';

interface SearchResult {
  type: string;
  query: string;
  exists?: boolean;
  error?: string;
}

interface VerificationResponse {
  query: string;
  trustScore: number;
  riskLevel: string;
  source: string;
  phones?: any[];
  company?: {
    name: string;
    nip: string;
    vat: string;
    phones?: any[];
  };
  community?: {
    alerts: number;
    totalReports: number;
    latestComments?: any[];
  };
}

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);
  private readonly ONE_DAY_MS = 24 * 60 * 60 * 1000;

  constructor(
    private readonly vatService: VatService,
    private readonly prisma: PrismaService,
    private readonly reportsService: ReportsService,
  ) {}

  /**
   * Search for a company by NIP or person by phone number
   * @param query - NIP (10 digits) or phone number
   * @returns Search result with type and metadata
   */
  async search(query: string): Promise<SearchResult> {
    if (!query || typeof query !== 'string') {
      throw new BadRequestException('Query must be a non-empty string');
    }

    const cleanQuery = query.replace(/[^a-zA-Z0-9]/g, '');
    let type = 'UNKNOWN';

    // Type detection
    if (/^\d{10}$/.test(cleanQuery)) {
      type = 'NIP';
    } else if (/^\d{9}$/.test(cleanQuery) || /^48\d{9}$/.test(cleanQuery)) {
      type = 'PHONE';
    }

    // NIP verification
    if (type === 'NIP') {
      return { type: 'NIP', query: cleanQuery };
    }

    // Phone verification
    if (type === 'PHONE') {
      const phoneEntry = await this.prisma.phoneNumber.findUnique({
        where: { number: cleanQuery },
      });
      return {
        type: 'PHONE',
        query: cleanQuery,
        exists: !!phoneEntry,
      };
    }

    return {
      type: 'UNKNOWN',
      query: cleanQuery,
      error: 'Invalid format. Provide NIP (10 digits) or phone number.',
    };
  }

  /**
   * Verify company data and calculate trust score
   * @param nip - Company NIP number
   * @returns Detailed verification response
   */
  async verifyCompany(nip: string): Promise<VerificationResponse> {
    if (!nip || !/^\d{10}$/.test(nip)) {
      throw new BadRequestException('Invalid NIP format');
    }

    try {
      const reportStats = await this.reportsService.getStatsForTarget(nip);
      const cachedCompany = await this.prisma.company.findUnique({
        where: { nip },
        include: { phones: true },
      });

      const isFresh =
        cachedCompany &&
        Date.now() - cachedCompany.updatedAt.getTime() < this.ONE_DAY_MS;

      let baseTrustScore = 0;
      let companyData: Company | null = null;
      let source = '';
      const phones = cachedCompany?.phones || [];

      if (isFresh && cachedCompany) {
        // Use cached data
        companyData = cachedCompany;
        baseTrustScore = cachedCompany.trustScore;
        source = 'CACHE_DB';
      } else {
        // Fetch from API
        const vatData = await this.vatService.checkVatStatus(nip);
        source = 'LIVE_API';

        if (!vatData || !vatData.found) {
          throw new NotFoundException(
            `Company with NIP ${nip} not found in VAT registry`,
          );
        }

        baseTrustScore = this.calculateInitialTrustScore(vatData);
        companyData = await this.upsertCompanyData(nip, vatData, baseTrustScore);
      }

      // Final calculation
      let finalTrustScore = baseTrustScore;
      if (reportStats.negative > 0) {
        finalTrustScore -= reportStats.negative * 15;
      }
      finalTrustScore = Math.max(0, finalTrustScore);

      return this.buildVerificationResponse(
        nip,
        finalTrustScore,
        source,
        companyData,
        phones,
        reportStats,
      );
    } catch (error) {
      this.logger.error(`Verification error for NIP ${nip}:`, error);
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new Error(`Verification failed: ${error.message}`);
    }
  }

  /**
   * Calculate initial trust score based on VAT data
   */
  private calculateInitialTrustScore(vatData: any): number {
    let score = 0;
    if (vatData.found) score += 30;
    if (vatData.statusVat === 'Czynny') score += 40;
    if (vatData.accountNumbers?.length > 0) score += 20;
    return score;
  }

  /**
   * Insert or update company data in database
   */
  private async upsertCompanyData(
    nip: string,
    vatData: any,
    trustScore: number,
  ): Promise<Company> {
    const riskLevel = this.calculateRiskLevel(trustScore);
    return this.prisma.company.upsert({
      where: { nip },
      update: {
        name: vatData.name,
        statusVat: vatData.statusVat,
        trustScore,
        riskLevel,
        rawData: vatData as any,
      },
      create: {
        nip,
        name: vatData.name,
        statusVat: vatData.statusVat,
        trustScore,
        riskLevel,
        rawData: vatData as any,
      },
    });
  }

  /**
   * Build the verification response object
   */
  private buildVerificationResponse(
    nip: string,
    trustScore: number,
    source: string,
    companyData: Company | null,
    phones: any[],
    reportStats: any,
  ): VerificationResponse {
    return {
      query: nip,
      trustScore,
      riskLevel: this.calculateRiskLevel(trustScore),
      source,
      phones,
      company: companyData
        ? {
            name: companyData.name,
            nip: companyData.nip,
            vat: companyData.statusVat,
            phones,
          }
        : {
            name: 'No data',
            nip,
            vat: 'Unknown',
          },
      community: {
        alerts: reportStats.negative,
        totalReports: reportStats.total,
        latestComments: this.mapReportComments(reportStats.entries),
      },
    };
  }

  /**
   * Map report entries to comment objects
   */
  private mapReportComments(entries: any[]): any[] {
    if (!Array.isArray(entries)) return [];
    return entries.slice(-5).map((r) => ({
      id: r.id,
      date: r.createdAt,
      reason: r.reason,
      comment: r.comment,
      rating: r.rating,
      reportedEmail: r.reportedEmail,
      facebookLink: r.facebookLink,
      screenshotUrl: r.screenshotUrl,
      bankAccount: r.bankAccount,
      phoneNumber: r.phoneNumber,
    }));
  }

  /**
   * ADMIN: Get all companies (paginated)
   */
  async getAllCompanies(limit: number = 100): Promise<any[]> {
    return this.prisma.company.findMany({
      select: {
        nip: true,
        name: true,
        statusVat: true,
        riskLevel: true,
        trustScore: true,
        updatedAt: true,
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * ADMIN: Get company details with phones
   */
  async getCompanyForAdmin(nip: string): Promise<Company | null> {
    return this.prisma.company.findUnique({
      where: { nip },
      include: { phones: true },
    });
  }

  /**
   * ADMIN: Update company
   */
  async updateCompany(nip: string, data: any): Promise<Company> {
    const { phones, ...companyData } = data;
    return this.prisma.company.update({
      where: { nip },
      data: {
        name: companyData.name,
        trustScore: Number(companyData.trustScore),
        riskLevel: companyData.riskLevel,
        statusVat: companyData.statusVat,
      },
    });
  }

  /**
   * Link phone number to company
   */
  async linkPhoneToCompany(nip: string, phoneNumber: string): Promise<any> {
    let company = await this.prisma.company.findUnique({ where: { nip } });

    if (!company) {
      company = await this.prisma.company.create({
        data: {
          nip,
          name: 'Manual Entry',
          statusVat: 'Unknown',
          trustScore: 50,
          riskLevel: 'Unknown',
        },
      });
    }

    return this.prisma.phoneNumber.upsert({
      where: { number: phoneNumber },
      update: { companyNip: nip, trustScore: 70 },
      create: {
        number: phoneNumber,
        countryCode: 'PL',
        companyNip: nip,
        trustScore: 70,
      },
    });
  }

  /**
   * ADMIN: Get all persons
   */
  async getAllPersons(limit: number = 200): Promise<any[]> {
    return this.prisma.person.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        bankAccount: true,
        trustScore: true,
        riskLevel: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { reports: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * ADMIN: Get person details with reports
   */
  async getPersonForAdmin(id: number): Promise<any> {
    if (!id || Number.isNaN(id)) {
      throw new BadRequestException('Invalid person ID');
    }
    return this.prisma.person.findUnique({
      where: { id },
      include: {
        reports: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            rating: true,
            reason: true,
            comment: true,
            createdAt: true,
            phoneNumber: true,
            bankAccount: true,
            reportedEmail: true,
            facebookLink: true,
          },
        },
      },
    });
  }

  /**
   * ADMIN: Update person
   */
  async updatePerson(id: number, data: any): Promise<any> {
    if (!id || Number.isNaN(id)) {
      throw new BadRequestException('Invalid person ID');
    }
    return this.prisma.person.update({
      where: { id },
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        bankAccount: data.bankAccount,
        trustScore: Number(data.trustScore ?? 50),
        riskLevel: data.riskLevel ?? 'Unknown',
      },
    });
  }

  /**
   * Calculate risk level based on trust score
   */
  private calculateRiskLevel(score: number): string {
    if (score >= 80) return 'Very Low';
    if (score >= 50) return 'Medium';
    if (score >= 20) return 'High';
    return 'Critical';
  }
}
