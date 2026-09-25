import { ContainerStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ChangeContainerStatusDto {
  @IsEnum(ContainerStatus)
  status!: ContainerStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
