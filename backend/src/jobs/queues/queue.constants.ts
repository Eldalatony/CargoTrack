/**
 * Queue names are shared between the API (producer) and the worker (consumer),
 * so they live in one place rather than being repeated as string literals.
 */
export const QUEUE_NOTIFICATIONS = 'notifications';
export const QUEUE_RETENTION = 'retention';

export const ALL_QUEUES = [QUEUE_NOTIFICATIONS, QUEUE_RETENTION] as const;

export type QueueName = (typeof ALL_QUEUES)[number];

/**
 * Retry policy for the notification pipeline (roadmap Phase 4).
 * After the final attempt BullMQ moves the job to its failed set, and the
 * processor marks the NOTIFICATIONS row DEAD_LETTER so it surfaces in the
 * Office Manager dashboard.
 */
export const NOTIFICATION_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: false,
};
