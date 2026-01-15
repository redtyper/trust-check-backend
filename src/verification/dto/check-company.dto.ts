import { IsString, Length, Matches } from 'class-validator';

/**
 * DTO for company verification via NIP
 *
 * Validates NIP (Numer Identyfikacji Podatkowej - Polish Tax Number)
 * Format: 10 digits (XXXXXXXXXX)
 * Example: 7010301234 (valid NIP), 5252000066 (valid NIP)
 *
 * Used in GET /verification/company/:nip endpoint
 */
export class CheckCompanyDto {
  /**
   * Polish Tax Number (NIP)
   *
   * Constraints:
   * - Must be a string
   * - Must be exactly 10 characters long
   * - Must contain only digits (0-9)
   * - Cannot contain letters or special characters
   *
   * @example "7010301234"
   */
  @IsString({ message: 'NIP must be a string' })
  @Length(10, 10, {
    message: 'NIP must be exactly 10 characters long',
  })
  @Matches(/^[0-9]{10}$/, {
    message: 'NIP must contain only 10 digits (0-9)',
  })
  nip: string;
}
