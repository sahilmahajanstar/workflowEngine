import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('execution_history')
export class ExecutionHistoryEntity {
  @PrimaryColumn('text')
  id!: string;

  @Column('text')
  enrollmentId!: string;

  @Column('text')
  stepId!: string;

  @Column('text')
  status!: string;

  @Column('simple-json')
  outcome!: any;

  @Column({ type: process.env.DB_TYPE === 'postgres' ? 'timestamp with time zone' : 'datetime' })
  timestamp!: Date;
}
