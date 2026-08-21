import { OmitType, PartialType } from '@nestjs/swagger';

import { CreateOrderDto } from './create-order.dto';

/**
 * clientId and items are deliberately not updatable.
 *
 * Moving an order between clients would hand one client another client's
 * history in a single PATCH, and it is the one field every scoped query
 * trusts. Items have their own endpoints because each change has to roll the
 * order totals forward.
 *
 * status is absent for the same reason it is absent from the model here:
 * it moves only through POST /orders/:id/status, where the state machine runs.
 */
export class UpdateOrderDto extends PartialType(
  OmitType(CreateOrderDto, ['clientId', 'items'] as const),
) {}
