import { PartialType } from '@nestjs/mapped-types';
import { CreateReportDto } from './create-report.dto';

/**
 * DTO for updating an existing report
 * All fields from CreateReportDto are optional for partial updates
 * Inherits all validation rules from CreateReportDto
 *
 * Use cases:
 * - Update report rating
 * - Modify comment or reason
 * - Add additional evidence (screenshots, URLs)
 * - Correct mistaken information
 *
 * Note: Some fields may be immutable depending on business logic
 * (e.g., targetType, targetValue may not be updatable to prevent report modification)
 */
export class UpdateReportDto extends PartialType(CreateReportDto) {}
