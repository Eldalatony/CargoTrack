import { PartialType } from '@nestjs/swagger';

import { CreateContainerDto } from './create-container.dto';

/**
 * Which fields may change depends on where the container is in its
 * lifecycle, so that rule lives in the service rather than in the shape.
 */
export class UpdateContainerDto extends PartialType(CreateContainerDto) {}
