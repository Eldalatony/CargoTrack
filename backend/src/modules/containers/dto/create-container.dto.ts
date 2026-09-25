import { PricingBasis, RouteType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateContainerDto {
  /** The ISO 6346 box number painted on the side, e.g. MSKU-4471820. */
  @IsString()
  @MinLength(4)
  @MaxLength(50)
  containerRef!: string;

  /** 20GP, 40GP, 40HC … kept free text; the office's list is short but open. */
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  containerType!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  capacityCbm!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  capacityWeightKg!: number;

  @IsOptional()
  @IsEnum(PricingBasis)
  pricingBasis?: PricingBasis;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  bookingCost?: number;

  /** Required alongside bookingCost — no money column without its currency. */
  @ValidateIf((dto: CreateContainerDto) => dto.bookingCost !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be a 3-letter ISO 4217 code, e.g. USD',
  })
  currency?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  originPort!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  destinationPort!: string;

  /**
   * The ROUTE_DECISION fork on the order diagram, recorded where it actually
   * lives: on the box. TRANSIT containers carry TRANSIT_LEGS rows.
   */
  @IsOptional()
  @IsEnum(RouteType)
  routeType?: RouteType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  insuranceRef?: string;

  @IsOptional()
  @IsUUID()
  freightProviderId?: string;

  @IsOptional()
  @IsUUID()
  customsAgentId?: string;
}
