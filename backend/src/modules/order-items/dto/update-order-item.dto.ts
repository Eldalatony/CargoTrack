import { PartialType } from '@nestjs/swagger';

import { OrderItemInputDto } from './order-item-input.dto';

export class UpdateOrderItemDto extends PartialType(OrderItemInputDto) {}
