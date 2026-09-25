import { IsString, MaxLength, MinLength } from 'class-validator';

export class HoldStockDto {
  /**
   * Free text by design: the office has no fixed taxonomy for holds
   * ("client waiting for Eid demand", "customs query on HS code"), and
   * forcing one would just fill the column with OTHER.
   */
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  holdReason!: string;
}
