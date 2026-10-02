import { DataSource } from 'typeorm';

export interface IDatabase {
  readonly dataSource: DataSource;
  init(): Promise<void>;
}
