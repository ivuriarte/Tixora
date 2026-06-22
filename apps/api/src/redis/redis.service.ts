import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('redis.url');
    if (!url) throw new Error('REDIS_URL is not configured');

    const isTls = url.startsWith('rediss://');
    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      ...(isTls && { tls: { rejectUnauthorized: false } }),
    });

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
  }

  async onModuleDestroy() {
    await this.client.quit();
    this.logger.log('Redis disconnected');
  }

  getClient(): Redis {
    return this.client;
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result > 0;
  }

  /** Atomic decrement — returns null if key doesn't exist or result < 0 */
  async decrBy(key: string, amount: number): Promise<number | null> {
    const result = await this.client.decrby(key, amount);
    if (result < 0) {
      // Rollback — restore the decremented amount
      await this.client.incrby(key, amount);
      return null;
    }
    return result;
  }

  async incrBy(key: string, amount: number): Promise<number> {
    return this.client.incrby(key, amount);
  }

  /**
   * Atomically increments a counter and sets its expiry on the first increment.
   * Keeping both operations in one Lua script prevents permanent rate-limit keys
   * if a process exits between INCR and EXPIRE.
   */
  async incrementWithTtl(
    key: string,
    ttlSeconds: number,
  ): Promise<{ count: number; ttlSeconds: number }> {
    const result = await this.client.eval(
      `
        local count = redis.call('INCR', KEYS[1])
        if count == 1 then
          redis.call('EXPIRE', KEYS[1], ARGV[1])
        end
        return { count, redis.call('TTL', KEYS[1]) }
      `,
      1,
      key,
      ttlSeconds,
    ) as [number, number];

    return {
      count: Number(result[0]),
      ttlSeconds: Math.max(0, Number(result[1])),
    };
  }

  async setIfNotExists(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  /** Batch get multiple keys in a single round-trip */
  async mget(keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];
    return this.client.mget(...keys);
  }

  /** Execute multiple INCRBY commands in a single pipeline round-trip */
  async pipelineIncrBy(entries: Array<{ key: string; value: number }>): Promise<void> {
    if (entries.length === 0) return;
    const pipeline = this.client.pipeline();
    for (const { key, value } of entries) {
      pipeline.incrby(key, value);
    }
    await pipeline.exec();
  }
}
