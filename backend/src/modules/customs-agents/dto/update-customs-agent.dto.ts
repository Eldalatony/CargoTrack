import { PartialType } from '@nestjs/swagger';

import { CreateCustomsAgentDto } from './create-customs-agent.dto';

export class UpdateCustomsAgentDto extends PartialType(CreateCustomsAgentDto) {}
