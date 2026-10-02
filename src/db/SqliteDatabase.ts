import { logger } from '../utils/Logger';
import { DataSource } from 'typeorm';
import { IDatabase } from './IDatabase';
import { InitialMigration1700000000000 } from './migrations/1700000000000-InitialMigration';
import { EnrollmentEntity } from './entities/EnrollmentEntity';
import { ExecutionHistoryEntity } from './entities/ExecutionHistoryEntity';

export class SqliteDatabase implements IDatabase {
  public readonly dataSource: DataSource;

  constructor(dbPath: string = ':memory:') {
    this.dataSource = new DataSource({
      type: 'sqlite',
      database: dbPath,
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
    await this.dataSource.query('PRAGMA journal_mode = WAL;');
  }
}
