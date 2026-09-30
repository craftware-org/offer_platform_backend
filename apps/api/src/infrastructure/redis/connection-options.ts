import type { RedisOptions } from 'bullmq';

/**
 * BullMQ connection options from a redis:// or rediss:// URL. BullMQ owns these connections and
 * requires maxRetriesPerRequest = null so blocking workers never give up.
 */
export function bullConnectionOptions(url: string): RedisOptions {
  const u = new URL(url);
  if (u.protocol !== 'redis:' && u.protocol !== 'rediss:')
    throw new Error('REDIS_URL must use redis:// or rediss://');
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    tls: u.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
