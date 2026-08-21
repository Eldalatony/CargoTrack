import {
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCustomsAgentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  /** The jurisdiction the agent clears in — the whole point of the record. */
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  country!: string;

  @IsOptional()
  @IsPhoneNumber(undefined, {
    message: 'phone must be in international format',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
