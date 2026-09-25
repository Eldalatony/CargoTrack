import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Body for lift-hold and release: an optional note for the audit trail. */
export class StockTransitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
