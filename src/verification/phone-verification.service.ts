import { Injectable, Logger } from '@nestjs/common';
import {
  PhoneNumberUtil,
  PhoneNumberFormat,
  PhoneNumber,
} from 'google-libphonenumber';
import { PrismaService } from '../prisma.service';

/**
 * Interface for phone number database entry
 */
interface PhoneNumberEntry {
  number: string;
  trustScore: number;
  riskLevel: string;
  reports: any[];
  company: any;
}

/**
 * Interface for person database entry
 */
interface PersonEntry {
  name: string;
  trustScore: number;
  riskLevel: string;
  reports: any[];
}

/**
 * Interface for verification response
 */
interface VerificationResponse {
  query: string;
  isPhone: boolean;
  trustScore: number;
  riskLevel: string;
  source: string;
  company: {
    name: string;
    nip: string;
    vat: string;
  } | null;
  community: {
    alerts: number;
    totalReports: number;
    latestComments: any[];
  };
}

/**
 * Service for phone number verification with trust scoring
 * Handles phone number parsing, validation, and report aggregation
 */
@Injectable()
export class PhoneVerificationService {
  private readonly phoneUtil = PhoneNumberUtil.getInstance();
  private readonly logger = new Logger(PhoneVerificationService.name);

  // Configuration constants for trust scoring
  private readonly DEFAULT_TRUST_SCORE = 50;
  private readonly NEGATIVE_REPORT_WEIGHT_NO_DB = 20;
  private readonly NEGATIVE_REPORT_WEIGHT_WITH_DB = 15;
  private readonly MIN_TRUST_SCORE = 0;
  private readonly DEFAULT_COUNTRY_CODE = 'PL';
  private readonly PHONE_REGEX = /[a-zA-Z]/;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Main method to verify a phone number and retrieve associated reports
   * @param rawInput - The phone number or person name to verify
   * @param countryCode - Country code for phone parsing (default: 'PL')
   * @returns VerificationResponse with trust score and reports
   */
  async checkPhone(
    rawInput: string,
    countryCode: string = this.DEFAULT_COUNTRY_CODE,
  ): Promise<VerificationResponse> {
    try {
      // Step 1: Parse and validate phone number
      const { formattedQuery, isPhone } = await this.parseAndValidatePhone(
        rawInput,
        countryCode,
      );

      // Step 2: Fetch database entries
      const { dbPhoneEntry, dbPersonEntry } = await this.fetchDatabaseEntries(
        formattedQuery,
        isPhone,
      );

      // Step 3: Aggregate reports
      const { phoneReports, personReports, company } = this.aggregateReports(
        dbPhoneEntry,
        dbPersonEntry,
      );
      const allReports = this.mergeAndSortReports(phoneReports, personReports);

      // Step 4: Calculate trust metrics
      const { trustScore, riskLevel } = this.calculateTrustMetrics(
        allReports,
        dbPhoneEntry,
        dbPersonEntry,
      );

      // Step 5: Build and return response
      return this.buildVerificationResponse(
        formattedQuery,
        isPhone,
        trustScore,
        riskLevel,
        company,
        allReports,
        !!dbPhoneEntry || !!dbPersonEntry,
      );
    } catch (error) {
      this.logger.error(
        `Error during phone verification: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Parse and validate phone number
   * @param rawInput - Raw phone number string
   * @param countryCode - Country code for parsing
   * @returns Object with formatted query and validation status
   */
  private async parseAndValidatePhone(
    rawInput: string,
    countryCode: string,
  ): Promise<{ formattedQuery: string; isPhone: boolean }> {
    let formattedQuery = rawInput;
    let isPhone = false;

    try {
      // Check if input contains letters (not a valid phone number)
      if (this.PHONE_REGEX.test(rawInput)) {
        throw new Error('Input contains letters and cannot be a phone number');
      }

      // Parse phone number
      const number: PhoneNumber = this.phoneUtil.parseAndKeepRawInput(
        rawInput,
        countryCode,
      );

      // Validate phone number
      if (this.phoneUtil.isValidNumber(number)) {
        formattedQuery = this.phoneUtil.format(
          number,
          PhoneNumberFormat.E164,
        );
        isPhone = true;
      } else {
        throw new Error('Phone number validation failed');
      }
    } catch (error) {
      this.logger.warn(
        `Failed to parse phone number: ${error.message}. Treating input as person name.`,
      );
      // Input will be treated as person name
      isPhone = false;
      formattedQuery = rawInput;
    }

    return { formattedQuery, isPhone };
  }

  /**
   * Fetch database entries for phone number and person
   * @param formattedQuery - Formatted query string
   * @param isPhone - Whether query is a valid phone number
   * @returns Database entries for phone and person
   */
  private async fetchDatabaseEntries(
    formattedQuery: string,
    isPhone: boolean,
  ): Promise<{ dbPhoneEntry: PhoneNumberEntry | null; dbPersonEntry: PersonEntry | null }> {
    let dbPhoneEntry: PhoneNumberEntry | null = null;
    let dbPersonEntry: PersonEntry | null = null;

    if (isPhone) {
      // Fetch phone number entry with reports and company
      try {
        dbPhoneEntry = (await this.prisma.phoneNumber.findUnique({
          where: { number: formattedQuery },
          include: {
            reports: { orderBy: { createdAt: 'desc' } },
            company: true,
          },
        })) as PhoneNumberEntry | null;
      } catch (error) {
        this.logger.warn(
          `Error fetching phone entry for ${formattedQuery}: ${error.message}`,
        );
      }
    }

    // Always try to fetch person entry by name
    try {
      dbPersonEntry = (await this.prisma.person.findFirst({
        where: { name: formattedQuery },
        include: { reports: { orderBy: { createdAt: 'desc' } } },
      })) as PersonEntry | null;
    } catch (error) {
      this.logger.warn(
        `Error fetching person entry for ${formattedQuery}: ${error.message}`,
      );
    }

    return { dbPhoneEntry, dbPersonEntry };
  }

  /**
   * Aggregate reports and company info from database entries
   * @param dbPhoneEntry - Phone number database entry
   * @param dbPersonEntry - Person database entry
   * @returns Aggregated reports and company information
   */
  private aggregateReports(
    dbPhoneEntry: PhoneNumberEntry | null,
    dbPersonEntry: PersonEntry | null,
  ): {
    phoneReports: any[];
    personReports: any[];
    company: any;
  } {
    const phoneReports = dbPhoneEntry?.reports || [];
    const personReports = dbPersonEntry?.reports || [];
    const company = dbPhoneEntry?.company || null;

    return { phoneReports, personReports, company };
  }

  /**
   * Merge reports from multiple sources and remove duplicates
   * @param phoneReports - Reports from phone number
   * @param personReports - Reports from person
   * @returns Merged and sorted array of unique reports
   */
  private mergeAndSortReports(
    phoneReports: any[],
    personReports: any[],
  ): any[] {
    const allReports = [...phoneReports, ...personReports];

    // Remove duplicates by ID
    const uniqueReports = allReports.filter(
      (obj, index, self) => index === self.findIndex((t) => t.id === obj.id),
    );

    // Sort by creation date (newest first)
    return uniqueReports.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  /**
   * Calculate trust score and risk level based on reports and database entries
   * @param allReports - All aggregated reports
   * @param dbPhoneEntry - Phone number database entry
   * @param dbPersonEntry - Person database entry
   * @returns Calculated trust score and risk level
   */
  private calculateTrustMetrics(
    allReports: any[],
    dbPhoneEntry: PhoneNumberEntry | null,
    dbPersonEntry: PersonEntry | null,
  ): { trustScore: number; riskLevel: string } {
    // Get trust score from database entries (phone entry has priority)
    let trustScore =
      dbPhoneEntry?.trustScore ??
      dbPersonEntry?.trustScore ??
      this.DEFAULT_TRUST_SCORE;
    let riskLevel =
      dbPhoneEntry?.riskLevel ?? dbPersonEntry?.riskLevel ?? 'Nieznany';

    // Count negative reports
    const negativeReports = allReports.filter((r) => r.rating <= 2).length;
    const existsInDb = !!dbPhoneEntry || !!dbPersonEntry;

    if (!existsInDb) {
      // No database entry - calculate dynamically from reports
      if (negativeReports > 0) {
        trustScore -= negativeReports * this.NEGATIVE_REPORT_WEIGHT_NO_DB;
        riskLevel = 'Wysoki';
      } else {
        riskLevel = 'Brak danych';
      }
    } else if (negativeReports > 0 && trustScore === this.DEFAULT_TRUST_SCORE) {
      // Database entry with neutral score and negative reports - adjust score
      trustScore -= negativeReports * this.NEGATIVE_REPORT_WEIGHT_WITH_DB;
      riskLevel = 'Podwyższone';
    }

    // Ensure trust score doesn't go below minimum
    trustScore = Math.max(trustScore, this.MIN_TRUST_SCORE);

    return { trustScore, riskLevel };
  }

  /**
   * Build the verification response object
   * @param query - The query string
   * @param isPhone - Whether query was a phone number
   * @param trustScore - Calculated trust score
   * @param riskLevel - Calculated risk level
   * @param company - Company information if available
   * @param allReports - All aggregated reports
   * @param existsInDb - Whether entry exists in database
   * @returns Complete verification response
   */
  private buildVerificationResponse(
    query: string,
    isPhone: boolean,
    trustScore: number,
    riskLevel: string,
    company: any,
    allReports: any[],
    existsInDb: boolean,
  ): VerificationResponse {
    const negativeReports = allReports.filter((r) => r.rating <= 2).length;

    return {
      query,
      isPhone,
      trustScore,
      riskLevel,
      source: existsInDb ? 'DB' : 'None',
      company: company
        ? {
            name: company.name,
            nip: company.nip,
            vat: company.statusVat,
          }
        : null,
      community: {
        alerts: negativeReports,
        totalReports: allReports.length,
        latestComments: allReports.map((r) => ({
          date: r.createdAt,
          reason: r.reason,
          comment: r.comment,
          rating: r.rating,
          phoneNumber: r.phoneNumber,
          bankAccount: r.bankAccount,
          reportedEmail: r.reportedEmail,
          facebookLink: r.facebookLink,
          screenshotUrl: r.screenshotUrl,
          screenshotPath: r.screenshotPath,
        })),
      },
    };
  }
}
