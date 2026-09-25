import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  country!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
}
