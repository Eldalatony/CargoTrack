import { PartialType } from '@nestjs/swagger';

import { CreateTransitLegDto } from './create-transit-leg.dto';

/** Timestamps are not here: they move through /arrival and /departure only. */
export class UpdateTransitLegDto extends PartialType(CreateTransitLegDto) {}
