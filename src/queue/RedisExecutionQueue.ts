import { Queue, Worker, ConnectionOptions } from 'bullmq';
import { IExecutionQueue } from './IExecutionQueue';
import { Enrollment } from '../types';

export class RedisExecutionQueue implements IExecutionQueue {
  private queue: Queue;
  private worker: Worker;

  constructor(
    connection: ConnectionOptions,
    private processFn: (enrollment: Enrollment) => Promise<void>
  ) {
    this.queue = new Queue('workflow-execution', { connection });

    this.worker = new Worker(
      'workflow-execution',
      async (job) => {
        const enrollment = job.data as Enrollment;
        await this.processFn(enrollment);
      },
      { connection }
    );

    this.worker.on('failed', (job, err) => {
      console.error(`Job ${job?.id} failed:`, err);
    });
  }

  async push(enrollment: Enrollment): Promise<void> {
    await this.queue.add('execute-step', enrollment, {
      jobId: `${enrollment.id}-${enrollment.currentStepId}-${Date.now()}`
    });
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}
