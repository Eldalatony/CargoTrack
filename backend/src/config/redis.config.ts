import type { RedisOptions } from 'ioredis';

/**
 * Turns a REDIS_URL into ioredis connection options.
 *
 * Done explicitly rather than handing the raw URL to ioredis so that BullMQ
 * gets a plain options object it can duplicate for its blocking connections,
 * and so `maxRetriesPerRequest: null` (required by BullMQ workers) is always
 * applied.
 *
 * Accepts redis:// and rediss:// (TLS, used by most managed providers).
 */
export function redisOptionsFromUrl(rawUrl: string): RedisOptions {
  const url = new URL(rawUrl);

  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error(
      `REDIS_URL must use redis:// or rediss://, received "${url.protocol}"`,
    );
  }

  const database = url.pathname.replace(/^\//, '');

  const options: RedisOptions = {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    // BullMQ requires this to be null on connections used by workers.
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  };

  if (url.username) {
    options.username = decodeURIComponent(url.username);
  }

  if (url.password) {
    options.password = decodeURIComponent(url.password);
  }

  if (database) {
    options.db = Number(database);
  }

  if (url.protocol === 'rediss:') {
    options.tls = { servername: url.hostname };
  }

  return options;
}
