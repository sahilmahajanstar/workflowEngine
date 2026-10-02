import { logger } from '../utils/Logger';
import { DataSource } from 'typeorm';
import { IDatabase } from './IDatabase';
import { InitialMigration1700000000000 } from './migrations/1700000000000-InitialMigration';
import { EnrollmentEntity } from './entities/EnrollmentEntity';
import { ExecutionHistoryEntity } from './entities/ExecutionHistoryEntity';

export class PostgresDatabase implements IDatabase {
  public readonly dataSource: DataSource;

  constructor() {
    this.dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS || 'postgres',
      database: process.env.DB_NAME || 'workflow',
      synchronize: false,
      migrationsRun: true,
      logging: process.env.NODE_ENV === 'test' ? false : ['query', 'error', 'schema'],
      entities: [EnrollmentEntity, ExecutionHistoryEntity],
      migrations: [InitialMigration1700000000000],
    });
  }

  async init(): Promise<void> {
    await this.dataSource.initialize();
    logger.info('Running migrations...');
    await this.dataSource.runMigrations();
    logger.info('Migrations complete');
  }
}
