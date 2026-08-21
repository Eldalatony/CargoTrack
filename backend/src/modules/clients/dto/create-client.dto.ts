import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Mandatory fields mirror what the office actually needs to raise an order:
 * a company to invoice, a person to call, and a country for customs. Address
 * and phone are genuinely optional at onboarding time.
 */
export class CreateClientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  companyName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  contactName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsPhoneNumber(undefined, {
    message: 'phone must be in international format, e.g. +20 100 555 0142',
  })
  phone?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  country!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  /** A consolidator shares container space with other clients. */
  @IsOptional()
  @IsBoolean()
  isConsolidator?: boolean;
}
