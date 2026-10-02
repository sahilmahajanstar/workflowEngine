import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ExecutionHistory } from '../../types';
import { EnrollmentEntity } from '../entities/EnrollmentEntity';
import { ExecutionHistoryEntity } from '../entities/ExecutionHistoryEntity';
import { IExecutionHistoryRepository } from './IExecutionHistoryRepository';

export class TypeOrmExecutionHistoryRepository implements IExecutionHistoryRepository {
  constructor(private dataSource: DataSource) {}

  async log(enrollmentId: string, stepId: string, status: string, outcome: any): Promise<void> {
    const repo = this.dataSource.getRepository(ExecutionHistoryEntity);
    const history = repo.create({
      id: uuidv4(),
      enrollmentId,
      stepId,
      status,
      outcome,
      timestamp: new Date()
    });
    await repo.save(history);
  }

  async getByContactId(contactId: string): Promise<ExecutionHistory[]> {
    const historyRows = await this.dataSource.getRepository(ExecutionHistoryEntity)
      .createQueryBuilder('h')
      .innerJoin(EnrollmentEntity, 'e', 'h.enrollmentId = e.id')
      .where('e.contactId = :contactId', { contactId })
      .orderBy('h.timestamp', 'DESC')
      .getMany();

    return historyRows as unknown as ExecutionHistory[];
  }
}
