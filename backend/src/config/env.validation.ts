import { z } from 'zod';

/**
 * The single place environment variables are read and validated.
 *
 * DATABASE_URL and REDIS_URL are the only connection details the application
 * knows about. No Compose DNS hostname appears anywhere in source — the local
 * stack and the production platform both supply these values from outside.
 *
 * The API and the worker share an image but not a configuration surface: the
 * worker serves no HTTP traffic and issues no tokens, so it must not demand
 * JWT_SECRET or CORS_ORIGIN. Each process validates only what it uses.
 */
const baseSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  LOG_LEVEL: z
    .enum(['error', 'warn', 'log', 'debug', 'verbose'])
    .default('debug'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  FILE_STORAGE_PATH: z.string().default('/app/storage'),
});

const apiSchema = baseSchema.extend({
  PORT: z.coerce.number().int().positive().default(4000),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
});

const workerSchema = baseSchema.extend({
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  /** Liveness port — the worker serves nothing else over HTTP. */
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(4001),
});

export type ApiEnv = z.infer<typeof apiSchema>;
export type WorkerEnv = z.infer<typeof workerSchema>;

function validate<T extends z.ZodTypeAny>(
  schema: T,
  process: string,
  raw: Record<string, unknown>,
): z.infer<T> {
  const result = schema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Invalid environment configuration for the ${process} process:\n${details}`,
    );
  }

  return result.data;
}

export const validateApiEnv = (raw: Record<string, unknown>): ApiEnv =>
  validate(apiSchema, 'api', raw);

export const validateWorkerEnv = (raw: Record<string, unknown>): WorkerEnv =>
  validate(workerSchema, 'worker', raw);
