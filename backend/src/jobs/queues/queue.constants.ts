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
 * 5 attempts, backing off 5s → 10s → 20s → 40s. After the final attempt the
 * NOTIFICATIONS row is DEAD_LETTER and BullMQ keeps the job in its failed set
 * for inspection.
 *
 * Every job's id is its NOTIFICATIONS row id. That makes enqueueing
 * idempotent — BullMQ ignores an add for a job id it already holds — which is
 * what lets the relay re-offer a row it is unsure about without ever
 * delivering it twice.
 */
export const NOTIFICATION_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: false,
};

/** Daily at 03:00 — quiet hours, and once a day is all a retention date needs. */
export const RETENTION_SCHEDULER_ID = 'client-document-retention';
export const RETENTION_CRON = '0 3 * * *';
export const RETENTION_JOB_NAME = 'purge-expired-client-documents';
