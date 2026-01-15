import { Controller, Get, Param, Post, Body, Patch, UsePipes, ValidationPipe } from '@nestjs/common';
import { VerificationService } from './verification.service';
import { PhoneVerificationService } from './phone-verification.service';
import { CheckCompanyDto } from './dto/check-company.dto';

@Controller('verification')
export class VerificationController {
  constructor(
    private readonly verificationService: VerificationService,
    private readonly phoneVerificationService: PhoneVerificationService
  ) {}

  // === CZĘŚĆ PUBLICZNA (Wyszukiwanie) ===

  @Get('search/:query')
  async search(@Param('query') query: string) {
    // Tutaj wywołujemy serwis! Logika jest tam.
    return this.verificationService.search(query);
  }
  
  @Get('company/:nip')
  @UsePipes(new ValidationPipe({ transform: true }))
  async checkCompany(@Param() params: CheckCompanyDto) {
    return this.verificationService.verifyCompany(params.nip);
  }

  @Get('phone/:number')
  async checkPhone(@Param('number') number: string) {
    return this.phoneVerificationService.checkPhone(number);
  }

  // === CZĘŚĆ ADMINISTRACYJNA (Panel) ===

  @Get('admin/companies')
  async getAllCompanies() {
    return this.verificationService.getAllCompanies();
  }

  @Get('admin/company/:nip')
  async getCompanyForAdmin(@Param('nip') nip: string) {
    return this.verificationService.getCompanyForAdmin(nip);
  }

  @Patch('admin/company/:nip')
  async updateCompany(@Param('nip') nip: string, @Body() body: any) {
    return this.verificationService.updateCompany(nip, body);
  }

  @Post('admin/link-phone')
  async linkPhone(@Body() body: { nip: string; phone: string }) {
    return this.verificationService.linkPhoneToCompany(body.nip, body.phone);
  }

  // === ADMIN OSOBY ===
  @Get('admin/persons')
  async getAllPersons() {
    return this.verificationService.getAllPersons();
  }

  @Get('admin/person/:id')
  async getPersonForAdmin(@Param('id') id: string) {
    return this.verificationService.getPersonForAdmin(Number(id));
  }

  @Patch('admin/person/:id')
  async updatePerson(@Param('id') id: string, @Body() body: any) {
    return this.verificationService.updatePerson(Number(id), body);
  }
}
