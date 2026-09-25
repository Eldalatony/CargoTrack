import { NotificationStatus } from '@prisma/client';

import { NOTIFICATION_JOB_OPTIONS } from '../queues/queue.constants';
import { statusAfterFailure } from './notification-delivery';

describe('statusAfterFailure', () => {
  const max = NOTIFICATION_JOB_OPTIONS.attempts;

  it('schedules a retry while attempts remain', () => {
    for (let failed = 1; failed < max; failed++) {
      expect(statusAfterFailure(failed, max, false)).toBe(
        NotificationStatus.FAILED,
      );
    }
  });

  it('dead-letters on the final attempt', () => {
    expect(statusAfterFailure(max, max, false)).toBe(
      NotificationStatus.DEAD_LETTER,
    );
  });

  it('dead-letters an unrecoverable failure on the first attempt', () => {
    expect(statusAfterFailure(1, max, true)).toBe(
      NotificationStatus.DEAD_LETTER,
    );
  });

  it('retries 5 times before giving up', () => {
    expect(max).toBe(5);
  });
});
