import { UserRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12, { message: 'password must be at least 12 characters' })
  password!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  /** Required for CLIENT users, rejected for Office Managers. */
  @IsOptional()
  @IsUUID()
  clientId?: string;
}
