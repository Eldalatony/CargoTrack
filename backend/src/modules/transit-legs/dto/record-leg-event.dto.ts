import { IsDateString, IsOptional } from 'class-validator';

export class RecordLegEventDto {
  /**
   * When it actually happened, if the office is recording it after the fact
   * (the freight provider's notice often lands a day late). Defaults to now.
   */
  @IsOptional()
  @IsDateString()
  at?: string;
}
