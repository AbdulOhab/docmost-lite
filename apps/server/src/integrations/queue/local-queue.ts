import { Inject, Logger } from '@nestjs/common';
import { QueueName } from './constants';

export type Job<T = any> = { id: string; name: string; data: T };

export type JobOptions = {
  // a job with the same id as a still-pending one is ignored
  jobId?: string;
  delay?: number;
  attempts?: number;
  // BullMQ-only options (backoff, deduplication, removeOnComplete...) are ignored
  [ignored: string]: unknown;
};

type Handler = (job: Job) => Promise<void>;

const RETRY_BASE_DELAY = 20 * 1000;

/**
 * In-process stand-in for a BullMQ queue. Jobs run in this process and
 * pending (delayed) jobs are lost on restart.
 */
export class LocalQueue {
  private readonly logger: Logger;
  private handler?: Handler;
  private readonly pending = new Map<string, NodeJS.Timeout>();
  private counter = 0;

  constructor(readonly name: string) {
    this.logger = new Logger(`Queue:${name}`);
  }

  process(handler: Handler): void {
    this.handler = handler;
  }

  async add(name: string, data?: any, opts: JobOptions = {}): Promise<void> {
    const id = opts.jobId ?? String(++this.counter);
    if (opts.jobId && this.pending.has(id)) return;

    this.schedule({ id, name, data }, opts.delay ?? 0, 1, opts.attempts ?? 1);
  }

  private schedule(
    job: Job,
    delay: number,
    attempt: number,
    maxAttempts: number,
  ): void {
    const timer = setTimeout(async () => {
      this.pending.delete(job.id);
      try {
        await this.handler?.(job);
      } catch (err) {
        this.logger.error(`${job.name} failed: ${err?.['message']}`);
        if (attempt < maxAttempts) {
          this.schedule(
            job,
            RETRY_BASE_DELAY * 2 ** (attempt - 1),
            attempt + 1,
            maxAttempts,
          );
        }
      }
    }, delay);
    timer.unref?.();
    this.pending.set(job.id, timer);
  }
}

export const getQueueToken = (name: QueueName) => `LocalQueue:${name}`;
export const InjectQueue = (name: QueueName) => Inject(getQueueToken(name));
export type Queue = LocalQueue;
