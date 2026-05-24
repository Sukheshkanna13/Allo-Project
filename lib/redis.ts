import { Redis } from '@upstash/redis';

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

// Initialize client conditionally so the build/compilation succeeds 
// even if environment variables are not populated in the current session.
export const redis = redisUrl && redisToken
  ? new Redis({ url: redisUrl, token: redisToken })
  : null;

/**
 * Acquires a non-blocking distributed lock for a specific key.
 * Uses Redis 'SET key value NX PX ttlMs' for high performance and atomicity.
 */
export async function acquireLock(key: string, ttlMs: number = 5000): Promise<boolean> {
  if (!redis) {
    console.warn('Redis credentials not set. Bypassing distributed lock.');
    return true; 
  }
  
  try {
    const result = await redis.set(`lock:${key}`, 'locked', {
      nx: true,
      px: ttlMs,
    });
    return result === 'OK';
  } catch (error) {
    console.error('Failed to acquire Redis lock:', error);
    return true; // Fallback to true to keep database processing alive on connection failure
  }
}

/**
 * Releases the distributed lock.
 */
export async function releaseLock(key: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(`lock:${key}`);
  } catch (error) {
    console.error('Failed to release Redis lock:', error);
  }
}

/**
 * Retrieves the cached API response associated with an idempotency key.
 */
export async function getCachedResponse(key: string): Promise<any> {
  if (!redis) return null;
  try {
    const data = await redis.get(`idempotency:${key}`);
    return data;
  } catch (error) {
    console.error('Failed to retrieve cached idempotency from Redis:', error);
    return null;
  }
}

/**
 * Caches an API response payload with a strict Time-to-Live (TTL) in seconds.
 * Defaults to 24 hours (86,400 seconds).
 */
export async function setCachedResponse(
  key: string,
  response: any,
  ttlSecs: number = 86400
): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(`idempotency:${key}`, response, { ex: ttlSecs });
  } catch (error) {
    console.error('Failed to save idempotency response to Redis:', error);
  }
}
