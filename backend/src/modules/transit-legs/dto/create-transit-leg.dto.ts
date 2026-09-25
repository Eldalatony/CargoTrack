import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTransitLegDto {
  /** The transit stop — e.g. Jebel Ali on a Shanghai → Alexandria run. */
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  port!: string;

  /** 1-based stop order. Omitted, the leg is appended after the last one. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  sequence?: number;
}
