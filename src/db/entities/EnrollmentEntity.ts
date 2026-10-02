import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { EnrollmentStatus } from '../../types';

@Entity('enrollments')
export class EnrollmentEntity {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  workflowId!: string;

  @Column('text')
  contactId!: string;

  @Column('text', { nullable: true })
  currentStepId!: string | null;

  @Column('text')
  status!: EnrollmentStatus;

  @Column({ type: process.env.DB_TYPE === 'postgres' ? 'timestamp with time zone' : 'datetime', nullable: true })
  waitUntil!: Date | null;

  @CreateDateColumn({ type: process.env.DB_TYPE === 'postgres' ? 'timestamp with time zone' : 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.DB_TYPE === 'postgres' ? 'timestamp with time zone' : 'datetime' })
  updatedAt!: Date;

  @Column('simple-json')
  context!: any;
}
