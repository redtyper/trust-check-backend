import { IsString, IsInt, Min, Max, IsIn } from 'class-validator';

export class CreateReportDto {
  @IsString()
  @IsIn(['NIP', 'PHONE', 'ACCOUNT'])
  targetType: string;

  @IsString()
  targetValue: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsString()
  reason: string;

  @IsString()
  comment: string;
}
