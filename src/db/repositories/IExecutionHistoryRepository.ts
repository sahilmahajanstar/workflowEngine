import { ExecutionHistory } from '../../types';

export interface IExecutionHistoryRepository {
  log(enrollmentId: string, stepId: string, status: string, outcome: any): Promise<void>;
  getByContactId(contactId: string): Promise<ExecutionHistory[]>;
}
