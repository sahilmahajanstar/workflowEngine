import { logger } from './utils/Logger';
import { IDatabase } from './db/IDatabase';
import { SqliteDatabase } from './db/SqliteDatabase';
import { PostgresDatabase } from './db/PostgresDatabase';
import { TypeOrmEnrollmentRepository } from './db/repositories/TypeOrmEnrollmentRepository';
import { TypeOrmExecutionHistoryRepository } from './db/repositories/TypeOrmExecutionHistoryRepository';
import { WorkflowEngine } from './engine/WorkflowEngine';
import { createServer } from './server';
import fs from 'fs';
import yaml from 'yaml';
import path from 'path';
import { RedisExecutionQueue } from './queue/RedisExecutionQueue';
import { RelationalSchemaValidator } from './validation/WorkflowSchema';

async function bootstrap() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'workflow.sqlite');
  
  // Ensure directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let db: IDatabase;
  if (process.env.DB_TYPE === 'postgres') {
    db = new PostgresDatabase();
  } else {
    db = new SqliteDatabase(dbPath);
  }
  await db.init();
  logger.info('Database initialized');

  const enrollmentsRepo = new TypeOrmEnrollmentRepository((db as any).dataSource);
  const historyRepo = new TypeOrmExecutionHistoryRepository((db as any).dataSource);

  // Initialize Queue and Engine
  let engine: WorkflowEngine;
  
  if (process.env.REDIS_HOST) {
    logger.info(`Connecting to Redis at ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}...`);
    const queue = new RedisExecutionQueue(
      { host: process.env.REDIS_HOST, port: parseInt(process.env.REDIS_PORT || '6379') },
      async (enrollment) => {
        if (engine) await engine.execute(enrollment);
      }
    );
    engine = new WorkflowEngine(enrollmentsRepo, historyRepo, queue);
  } else {
    engine = new WorkflowEngine(enrollmentsRepo, historyRepo);
  }

  // Load sample workflow
  const workflowFile = path.join(__dirname, '..', 'workflows', 'relational_sample.yaml');
  if (fs.existsSync(workflowFile)) {
    const fileContent = fs.readFileSync(workflowFile, 'utf8');
    const parsedSchema = yaml.parse(fileContent);
    
    // Validate schema
    const validationResult = RelationalSchemaValidator.safeParse(parsedSchema);
    if (!validationResult.success) {
      logger.error('Failed to validate workflow schema:', validationResult.error.format());
      process.exit(1); // Fail fast in production if workflows are invalid
    }
    
    engine.loadSchema(validationResult.data);
    logger.info(`Loaded relational schema from ${workflowFile}`);
  } else {
    logger.warn(`No workflows found at ${workflowFile}`);
  }

  // Start the background sweeper to catch any Dual-Write queue failures
  // This runs once on startup and then every 5 minutes.
  // TODO [PRODUCTION]: At scale with multiple worker nodes, ensure this uses row-level locks (SKIP LOCKED)
  // or offload this to a single dedicated Cron job to prevent multiple workers from sweeping concurrently.
  await engine.recoverRunning().catch(err => logger.error('Error during initial recovery:', err));
  
  const recoverInterval = setInterval(() => {
    engine.recoverRunning().catch(err => {
      logger.error('Error in recovery sweeper:', err);
    });
  }, 5 * 60 * 1000); // 5 minutes
  
  const app = createServer(engine, historyRepo, enrollmentsRepo);
  const port = process.env.PORT || 3000;

  const server = app.listen(port, () => {
    logger.info(`Server listening on port ${port}`);
  });

  // Start polling
  // TODO [PRODUCTION]: Replace this naive `setInterval` poller with a distributed Job Scheduler 
  // like Temporal, BullMQ delayed jobs, or AWS EventBridge to handle wait actions at scale 
  // without race conditions or memory leaks across horizontally scaled worker nodes.
  const pollInterval = setInterval(() => {
    engine.resumeWaiting().catch(err => {
      logger.error('Error polling wait states:', err);
    });
  }, 1 * 60 * 1000); // Check every 1 minute

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`\nReceived ${signal}. Starting graceful shutdown...`);
    clearInterval(pollInterval);
    clearInterval(recoverInterval);
    
    server.close(() => {
      logger.info('HTTP server closed.');
    });

    try {
      await engine.stopWorker();
      logger.info('Workflow worker queue stopped.');
      if ((db as any).dataSource?.isInitialized) {
        await (db as any).dataSource.destroy();
        logger.info('Database connection pool closed.');
      }
      process.exit(0);
    } catch (err) {
      logger.error('Error during graceful shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch(logger.error);

