import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { EnrollmentEntity } from './db/entities/EnrollmentEntity';
import { ExecutionHistoryEntity } from './db/entities/ExecutionHistoryEntity';
import { InitialMigration1700000000000 } from './db/migrations/1700000000000-InitialMigration';
import path from 'path';

const isPostgres = process.env.DB_TYPE === 'postgres';

export const AppDataSource = new DataSource(
  isPostgres
    ? {
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASS || 'postgres',
        database: process.env.DB_NAME || 'workflow',
        synchronize: false,
        logging: process.env.NODE_ENV === 'test' ? false : true,
        entities: [EnrollmentEntity, ExecutionHistoryEntity],
        migrations: [InitialMigration1700000000000],
      }
    : {
        type: 'sqlite',
        database: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'workflow.sqlite'),
        synchronize: false,
        logging: process.env.NODE_ENV === 'test' ? false : true,
        entities: [EnrollmentEntity, ExecutionHistoryEntity],
        migrations: [InitialMigration1700000000000],
      }
);
