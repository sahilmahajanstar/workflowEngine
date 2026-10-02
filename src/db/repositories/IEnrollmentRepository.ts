import { Enrollment, EnrollmentStatus } from '../../types';

export interface IEnrollmentRepository {
  create(enrollment: Enrollment): Promise<void>;
  getById(id: string): Promise<Enrollment | null>;
  update(enrollment: Enrollment): Promise<void>;
  getPendingWaits(now: number): Promise<Enrollment[]>;
  getByStatus(status: EnrollmentStatus): Promise<Enrollment[]>;
  getByContactId(contactId: string): Promise<Enrollment[]>;
}
