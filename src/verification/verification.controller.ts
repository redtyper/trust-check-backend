import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Patch,
  UsePipes,
  ValidationPipe,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { VerificationService } from './verification.service';
import { PhoneVerificationService } from './phone-verification.service';
import { CheckCompanyDto } from './dto/check-company.dto';

/**
 * Response DTO for search operations
 */
interface SearchResponse {
  type: string;
  query: string;
  exists?: boolean;
  error?: string;
}

/**
 * Response DTO for company verification
 */
interface CompanyVerificationResponse {
  query: string;
  trustScore: number;
  riskLevel: string;
  source: string;
  company?: any;
  community?: any;
  phones?: any[];
}

/**
 * Response DTO for phone verification
 */
interface PhoneVerificationResponse {
  query: string;
  isPhone: boolean;
  trustScore: number;
  riskLevel: string;
  source: string;
  company?: any;
  community?: any;
}

/**
 * Verification Controller
 *
 * Provides endpoints for:
 * - Public: Company/Phone verification and search
 * - Admin: Management of companies and persons
 */
@Controller('verification')
export class VerificationController {
  private readonly logger = new Logger(VerificationController.name);

  constructor(
    private readonly verificationService: VerificationService,
    private readonly phoneVerificationService: PhoneVerificationService,
  ) {}

  // ============ PUBLIC ENDPOINTS (Search) ============

  /**
   * Search for company or person
   * @param query NIP (10 digits) or phone number
   * @returns Search result with type and metadata
   */
  @Get('search/:query')
  @HttpCode(HttpStatus.OK)
  async search(@Param('query') query: string): Promise<SearchResponse> {
    if (!query || query.trim().length === 0) {
      throw new BadRequestException('Query cannot be empty');
    }
    this.logger.log(`Searching for query: ${query}`);
    try {
      return await this.verificationService.search(query);
    } catch (error) {
      this.logger.error(`Search error for query ${query}:`, error);
      throw new InternalServerErrorException('Search failed');
    }
  }

  /**
   * Verify company by NIP
   * @param params Validation object containing NIP
   * @returns Detailed company verification response
   */
  @Get('company/:nip')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async checkCompany(
    @Param() params: CheckCompanyDto,
  ): Promise<CompanyVerificationResponse> {
    this.logger.log(`Verifying company with NIP: ${params.nip}`);
    try {
      return await this.verificationService.verifyCompany(params.nip);
    } catch (error) {
      this.logger.error(`Company verification error for NIP ${params.nip}:`, error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Company verification failed');
    }
  }

  /**
   * Verify phone number
   * @param number Phone number to verify
   * @returns Phone verification response with risk assessment
   */
  @Get('phone/:number')
  @HttpCode(HttpStatus.OK)
  async checkPhone(
    @Param('number') number: string,
  ): Promise<PhoneVerificationResponse> {
    if (!number || number.trim().length === 0) {
      throw new BadRequestException('Phone number cannot be empty');
    }
    this.logger.log(`Verifying phone number: ${number}`);
    try {
      return await this.phoneVerificationService.checkPhone(number);
    } catch (error) {
      this.logger.error(`Phone verification error for number ${number}:`, error);
      throw new InternalServerErrorException('Phone verification failed');
    }
  }

  // ============ ADMIN ENDPOINTS (Management) ============

  /**
   * ADMIN: Get all companies (paginated)
   * @returns List of all companies with key information
   */
  @Get('admin/companies')
  @HttpCode(HttpStatus.OK)
  async getAllCompanies() {
    this.logger.log('Fetching all companies (admin)');
    try {
      return await this.verificationService.getAllCompanies();
    } catch (error) {
      this.logger.error('Error fetching all companies:', error);
      throw new InternalServerErrorException('Failed to fetch companies');
    }
  }

  /**
   * ADMIN: Get single company details
   * @param nip Company NIP
   * @returns Company details with phones and related data
   */
  @Get('admin/company/:nip')
  @HttpCode(HttpStatus.OK)
  async getCompanyForAdmin(@Param('nip') nip: string) {
    if (!nip || !/^\d{10}$/.test(nip)) {
      throw new BadRequestException('Invalid NIP format');
    }
    this.logger.log(`Fetching company details for NIP: ${nip} (admin)`);
    try {
      return await this.verificationService.getCompanyForAdmin(nip);
    } catch (error) {
      this.logger.error(`Error fetching company details for NIP ${nip}:`, error);
      throw new InternalServerErrorException('Failed to fetch company details');
    }
  }

  /**
   * ADMIN: Update company information
   * @param nip Company NIP
   * @param body Update data
   * @returns Updated company data
   */
  @Patch('admin/company/:nip')
  @HttpCode(HttpStatus.OK)
  async updateCompany(
    @Param('nip') nip: string,
    @Body() body: Record<string, any>,
  ) {
    if (!nip || !/^\d{10}$/.test(nip)) {
      throw new BadRequestException('Invalid NIP format');
    }
    if (!body || Object.keys(body).length === 0) {
      throw new BadRequestException('Update body cannot be empty');
    }
    this.logger.log(`Updating company with NIP: ${nip} (admin)`);
    try {
      return await this.verificationService.updateCompany(nip, body);
    } catch (error) {
      this.logger.error(`Error updating company NIP ${nip}:`, error);
      throw new InternalServerErrorException('Failed to update company');
    }
  }

  /**
   * ADMIN: Link phone number to company
   * @param body NIP and phone number
   * @returns Updated phone entry
   */
  @Post('admin/link-phone')
  @HttpCode(HttpStatus.CREATED)
  async linkPhone(
    @Body() body: { nip: string; phone: string },
  ) {
    if (!body?.nip || !/^\d{10}$/.test(body.nip)) {
      throw new BadRequestException('Invalid NIP format');
    }
    if (!body?.phone || body.phone.trim().length === 0) {
      throw new BadRequestException('Phone number cannot be empty');
    }
    this.logger.log(
      `Linking phone ${body.phone} to company ${body.nip} (admin)`,
    );
    try {
      return await this.verificationService.linkPhoneToCompany(
        body.nip,
        body.phone,
      );
    } catch (error) {
      this.logger.error(
        `Error linking phone to company ${body.nip}:`,
        error,
      );
      throw new InternalServerErrorException('Failed to link phone');
    }
  }

  // ============ ADMIN ENDPOINTS (Persons) ============

  /**
   * ADMIN: Get all persons (paginated)
   * @returns List of all persons with statistics
   */
  @Get('admin/persons')
  @HttpCode(HttpStatus.OK)
  async getAllPersons() {
    this.logger.log('Fetching all persons (admin)');
    try {
      return await this.verificationService.getAllPersons();
    } catch (error) {
      this.logger.error('Error fetching all persons:', error);
      throw new InternalServerErrorException('Failed to fetch persons');
    }
  }

  /**
   * ADMIN: Get single person details
   * @param id Person ID
   * @returns Person details with related reports
   */
  @Get('admin/person/:id')
  @HttpCode(HttpStatus.OK)
  async getPersonForAdmin(@Param('id') id: string) {
    const personId = parseInt(id, 10);
    if (isNaN(personId) || personId <= 0) {
      throw new BadRequestException('Invalid person ID');
    }
    this.logger.log(`Fetching person details for ID: ${personId} (admin)`);
    try {
      return await this.verificationService.getPersonForAdmin(personId);
    } catch (error) {
      this.logger.error(`Error fetching person ID ${personId}:`, error);
      throw new InternalServerErrorException('Failed to fetch person details');
    }
  }

  /**
   * ADMIN: Update person information
   * @param id Person ID
   * @param body Update data
   * @returns Updated person data
   */
  @Patch('admin/person/:id')
  @HttpCode(HttpStatus.OK)
  async updatePerson(
    @Param('id') id: string,
    @Body() body: Record<string, any>,
  ) {
    const personId = parseInt(id, 10);
    if (isNaN(personId) || personId <= 0) {
      throw new BadRequestException('Invalid person ID');
    }
    if (!body || Object.keys(body).length === 0) {
      throw new BadRequestException('Update body cannot be empty');
    }
    this.logger.log(`Updating person with ID: ${personId} (admin)`);
    try {
      return await this.verificationService.updatePerson(personId, body);
    } catch (error) {
      this.logger.error(`Error updating person ID ${personId}:`, error);
      throw new InternalServerErrorException('Failed to update person');
    }
  }
}
