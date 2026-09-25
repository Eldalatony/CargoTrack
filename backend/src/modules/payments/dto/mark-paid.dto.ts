import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class MarkPaidDto {
  /** When the money arrived. Defaults to now. */
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
}
