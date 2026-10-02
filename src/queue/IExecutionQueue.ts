import { Enrollment } from '../types';

export interface IExecutionQueue {
  push(enrollment: Enrollment): Promise<void>;
  close(): Promise<void>;
}
