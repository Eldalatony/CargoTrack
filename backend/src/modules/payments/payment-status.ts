import { UnprocessableEntityException } from '@nestjs/common';

/**
 * Payments have no status column — `paid_at` is null or it is not. These are
 * the words their STATUS_HISTORY rows use for the same facts, so the audit
 * trail (and the notification each row fans out to) reads as a story.
 */
export const PAYMENT_OUTSTANDING = 'OUTSTANDING';
export const PAYMENT_PAID = 'PAID';
export const PAYMENT_VOIDED = 'VOIDED';

/** Names of the payment gates on the order state diagram. */
export type PaymentGuard = 'deposit' | 'balance' | 'qc_signoff';

/**
 * A failed guard answers 422 with the guard's name, as the state diagram's
 * transition contract specifies, so a caller can tell "wrong state" from
 * "right state, money missing" without parsing the message.
 */
export function guardFailed(
  guard: PaymentGuard,
  message: string,
): UnprocessableEntityException {
  return new UnprocessableEntityException({
    statusCode: 422,
    error: 'guard_failed',
    guard,
    message,
  });
}
