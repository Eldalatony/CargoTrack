import { PartialType } from '@nestjs/swagger';

import { CreateFreightProviderDto } from './create-freight-provider.dto';

export class UpdateFreightProviderDto extends PartialType(
  CreateFreightProviderDto,
) {}
