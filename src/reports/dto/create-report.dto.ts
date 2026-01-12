import { IsString, IsInt, Min, Max, IsIn, IsOptional, IsUrl, IsEmail } from 'class-validator';

export class CreateReportDto {
  @IsString()
  @IsIn(['NIP', 'PHONE', 'PERSON']) // Dodaliśmy 'PERSON' jako typ
  targetType: string;

  @IsString()
  targetValue: string; // NIP lub Numer Telefonu

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  reason: string;

  @IsString()
  comment: string;

  // === NOWE POLA OPCJONALNE ===
  @IsOptional()
  @IsEmail()
  reportedEmail?: string;

  @IsOptional()
  @IsUrl()
  facebookLink?: string;

  @IsOptional()
  @IsString() // Tu można dać @IsUrl, ale dla MVP string wystarczy
  screenshotUrl?: string;
}
