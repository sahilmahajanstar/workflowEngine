import { DataSource, LessThanOrEqual } from 'typeorm';
import { Enrollment, EnrollmentStatus } from '../../types';
import { EnrollmentEntity } from '../entities/EnrollmentEntity';
import { IEnrollmentRepository } from './IEnrollmentRepository';

export class TypeOrmEnrollmentRepository implements IEnrollmentRepository {
  constructor(private dataSource: DataSource) {}

  async create(enrollment: Enrollment): Promise<void> {
    const repo = this.dataSource.getRepository(EnrollmentEntity);
    await repo.save(repo.create(enrollment));
  }

  async getById(id: string): Promise<Enrollment | null> {
    const repo = this.dataSource.getRepository(EnrollmentEntity);
    const row = await repo.findOneBy({ id });
    if (!row) return null;
    return row as Enrollment;
  }

  async update(enrollment: Enrollment): Promise<void> {
    const repo = this.dataSource.getRepository(EnrollmentEntity);
    await repo.save(enrollment);
  }

  async getPendingWaits(now: number): Promise<Enrollment[]> {
    const repo = this.dataSource.getRepository(EnrollmentEntity);
    const rows = await repo.find({
      where: {
        status: EnrollmentStatus.WAITING,
        waitUntil: LessThanOrEqual(new Date(now)),
      }
    });
    return rows as Enrollment[];
  }

  async getByStatus(status: EnrollmentStatus): Promise<Enrollment[]> {
    const repo = this.dataSource.getRepository(EnrollmentEntity);
    const rows = await repo.find({ where: { status } });
    return rows as Enrollment[];
  }

  async getByContactId(contactId: string): Promise<Enrollment[]> {
    const repo = this.dataSource.getRepository(EnrollmentEntity);
    const rows = await repo.find({ 
      where: { contactId },
      order: { createdAt: 'DESC' }
    });
    return rows as Enrollment[];
  }
}
