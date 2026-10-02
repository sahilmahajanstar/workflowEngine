import { logger } from '../utils/Logger';
import { IExecutionQueue } from './IExecutionQueue';
import { Enrollment } from '../types';

export class MemoryExecutionQueue implements IExecutionQueue {
  private queue: Enrollment[] = [];
  private workerInterval?: NodeJS.Timeout;

  constructor(private processFn: (enrollment: Enrollment) => Promise<void>) {
    this.startWorker();
  }

  async push(enrollment: Enrollment): Promise<void> {
    this.queue.push(enrollment);
  }

  private startWorker() {
    this.workerInterval = setInterval(async () => {
      const batch = this.queue.splice(0, this.queue.length);
      for (const enrollment of batch) {
        try {
          await this.processFn(enrollment);
        } catch (err) {
          logger.error(`Failed to execute enrollment ${enrollment.id}:`, err);
        }
      }
    }, 50);
    this.workerInterval.unref();
  }

  async close(): Promise<void> {
    if (this.workerInterval) clearInterval(this.workerInterval);
  }
}
