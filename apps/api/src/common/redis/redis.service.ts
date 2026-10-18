import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

export type RedisMessageListener = (message: any, channel: string) => void;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClientType | null = null;
  private subClient: RedisClientType | null = null;
  private isConnected = false;
  private hasReportedFailure = false;
  private readonly subscribers = new Map<string, Set<RedisMessageListener>>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.config.get<string>('REDIS_URL') || process.env.REDIS_URL;
    if (!redisUrl) {
      this.logger.log('[Redis] No REDIS_URL configured; operating in local in-memory fallback mode.');
      return;
    }

    try {
      this.logger.log(`[Redis] Connecting to Redis instance...`);
      this.client = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries: number) => {
            const delay = Math.min(retries * 500, 5000);
            return delay;
          },
          connectTimeout: 5000,
        },
      }) as RedisClientType;

      this.client.on('error', (err: Error) => {
        this.isConnected = false;
        if (!this.hasReportedFailure) {
          this.logger.warn(`[Redis Connection Error] ${err.message}. Operating in fallback mode.`);
          this.hasReportedFailure = true;
        }
      });

      this.client.on('ready', () => {
        this.isConnected = true;
        this.hasReportedFailure = false;
        this.logger.log('[Redis] Primary client connected and ready.');
      });

      await this.client.connect();

      // Initialize subscriber client for Pub/Sub
      this.subClient = this.client.duplicate() as RedisClientType;
      this.subClient.on('error', (err: Error) => {
        this.logger.warn(`[Redis Subscriber Error] ${err.message}`);
      });
      await this.subClient.connect();
      this.logger.log('[Redis] Subscriber client ready.');
    } catch (err) {
      this.isConnected = false;
      this.logger.warn(`[Redis Init Failed] ${(err as Error).message}. Continuing with graceful in-memory degradation.`);
    }
  }

  async onModuleDestroy() {
    try {
      if (this.subClient?.isOpen) await this.subClient.quit();
      if (this.client?.isOpen) await this.client.quit();
    } catch {
      // Ignore disconnect errors during process shutdown
    }
  }

  public get isReady(): boolean {
    return this.isConnected && !!this.client?.isOpen;
  }

  // -------------------------------------------------------------------------
  // Key-Value Cache Operations
  // -------------------------------------------------------------------------

  async get<T>(key: string): Promise<T | null> {
    if (!this.isReady || !this.client) return null;
    try {
      const data = await (this.client as any).get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (err) {
      this.logger.debug(`[Redis GET Failed] key=${key}: ${(err as Error).message}`);
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    if (!this.isReady || !this.client) return;
    try {
      const payload = JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, payload, { EX: Math.max(1, Math.floor(ttlSeconds)) });
      } else {
        await this.client.set(key, payload);
      }
    } catch (err) {
      this.logger.debug(`[Redis SET Failed] key=${key}: ${(err as Error).message}`);
    }
  }

  async del(key: string | string[]): Promise<void> {
    if (!this.isReady || !this.client) return;
    try {
      const keys = Array.isArray(key) ? key : [key];
      if (keys.length === 0) return;
      await this.client.del(keys);
    } catch (err) {
      this.logger.debug(`[Redis DEL Failed]: ${(err as Error).message}`);
    }
  }

  async delPattern(pattern: string): Promise<number> {
    if (!this.isReady || !this.client) return 0;
    try {
      let count = 0;
      let cursor = '0';
      do {
        const reply = await this.client.scan(cursor, { MATCH: pattern, COUNT: 100 });
        cursor = String(reply.cursor);
        if (reply.keys.length > 0) {
          await this.client.del(reply.keys);
          count += reply.keys.length;
        }
      } while (cursor !== '0');
      return count;
    } catch (err) {
      this.logger.debug(`[Redis SCAN/DEL Failed] pattern=${pattern}: ${(err as Error).message}`);
      return 0;
    }
  }

  // -------------------------------------------------------------------------
  // Tag-Based Cache Operations
  // -------------------------------------------------------------------------

  async tagKey(tag: string, key: string, ttlSeconds = 86400): Promise<void> {
    if (!this.isReady || !this.client) return;
    try {
      const tagKey = `tfhc:tag:${tag}`;
      await this.client.sAdd(tagKey, key);
      await this.client.expire(tagKey, Math.max(60, ttlSeconds));
    } catch (err) {
      this.logger.debug(`[Redis tagKey Failed] tag=${tag} key=${key}: ${(err as Error).message}`);
    }
  }

  async invalidateTag(tag: string): Promise<void> {
    if (!this.isReady || !this.client) return;
    try {
      const tagKey = `tfhc:tag:${tag}`;
      const keys = await this.client.sMembers(tagKey);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      await this.client.del(tagKey);
      await this.publish('tfhc:cache:invalidation', { tag, timestamp: Date.now() });
    } catch (err) {
      this.logger.debug(`[Redis invalidateTag Failed] tag=${tag}: ${(err as Error).message}`);
    }
  }

  async invalidateTags(tags: string[]): Promise<void> {
    for (const tag of tags) {
      await this.invalidateTag(tag);
    }
  }

  // -------------------------------------------------------------------------
  // Set Operations (Presence, Active Users)
  // -------------------------------------------------------------------------

  async sAdd(key: string, member: string, ttlSeconds?: number): Promise<void> {
    if (!this.isReady || !this.client) return;
    try {
      await this.client.sAdd(key, member);
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.expire(key, Math.floor(ttlSeconds));
      }
    } catch (err) {
      this.logger.debug(`[Redis sAdd Failed] key=${key}: ${(err as Error).message}`);
    }
  }

  async sRem(key: string, member: string): Promise<void> {
    if (!this.isReady || !this.client) return;
    try {
      await this.client.sRem(key, member);
    } catch (err) {
      this.logger.debug(`[Redis sRem Failed] key=${key}: ${(err as Error).message}`);
    }
  }

  async sMembers(key: string): Promise<string[]> {
    if (!this.isReady || !this.client) return [];
    try {
      return await this.client.sMembers(key);
    } catch (err) {
      this.logger.debug(`[Redis sMembers Failed] key=${key}: ${(err as Error).message}`);
      return [];
    }
  }

  async sIsMember(key: string, member: string): Promise<boolean> {
    if (!this.isReady || !this.client) return false;
    try {
      return Boolean(await this.client.sIsMember(key, member));
    } catch (err) {
      this.logger.debug(`[Redis sIsMember Failed] key=${key}: ${(err as Error).message}`);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Real-Time Pub/Sub Distribution
  // -------------------------------------------------------------------------

  async publish(channel: string, message: any): Promise<void> {
    if (!this.isReady || !this.client) return;
    try {
      const payload = typeof message === 'string' ? message : JSON.stringify(message);
      await this.client.publish(channel, payload);
    } catch (err) {
      this.logger.debug(`[Redis PUBLISH Failed] channel=${channel}: ${(err as Error).message}`);
    }
  }

  async subscribe(channel: string, listener: RedisMessageListener): Promise<() => void> {
    let set = this.subscribers.get(channel);
    if (!set) {
      set = new Set();
      this.subscribers.set(channel, set);
    }
    set.add(listener);

    if (this.subClient?.isOpen && set.size === 1) {
      try {
        await this.subClient.subscribe(channel, (rawMessage) => {
          let parsed = rawMessage;
          try {
            parsed = JSON.parse(rawMessage);
          } catch {
            // Keep as string if not JSON
          }
          const listeners = this.subscribers.get(channel);
          if (listeners) {
            for (const fn of listeners) {
              try {
                fn(parsed, channel);
              } catch (e) {
                this.logger.error(`[Redis Subscriber Handler Error] ${channel}: ${(e as Error).message}`);
              }
            }
          }
        });
      } catch (err) {
        this.logger.warn(`[Redis SUBSCRIBE Failed] channel=${channel}: ${(err as Error).message}`);
      }
    }

    return () => {
      const currentSet = this.subscribers.get(channel);
      if (currentSet) {
        currentSet.delete(listener);
        if (currentSet.size === 0) {
          this.subscribers.delete(channel);
          if (this.subClient?.isOpen) {
            this.subClient.unsubscribe(channel).catch(() => {});
          }
        }
      }
    };
  }
}
