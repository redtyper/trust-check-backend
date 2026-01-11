import { IsString, Length, Matches } from 'class-validator';

export class CheckCompanyDto {
  @IsString()
  @Length(10, 10, { message: 'NIP musi składać się z 10 znaków' })
  @Matches(/^[0-9]+$/, { message: 'NIP może zawierać tylko cyfry' })
  nip: string;
}