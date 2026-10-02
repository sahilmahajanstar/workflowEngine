import request from 'supertest';
import { createServer } from '../src/server';
import { WorkflowEngine } from '../src/engine/WorkflowEngine';
import { TypeOrmEnrollmentRepository } from '../src/db/repositories/TypeOrmEnrollmentRepository';
import { TypeOrmExecutionHistoryRepository } from '../src/db/repositories/TypeOrmExecutionHistoryRepository';
import { SqliteDatabase } from '../src/db/SqliteDatabase';
import { RelationalSchema } from '../src/types';

describe('Workflow API', () => {
  let db: SqliteDatabase;
  let engine: WorkflowEngine;
  let enrollmentsRepo: TypeOrmEnrollmentRepository;
  let historyRepo: TypeOrmExecutionHistoryRepository;
  let app: any;

  const sampleSchema: RelationalSchema = {
    workflows: [{ id: 'w1', status: 'active' }],
    triggers: [{ id: 't1', eventName: 'user_signed_up' }],
    workflow_triggers: [{ workflowId: 'w1', triggerId: 't1', initialStepId: 'step1', status: 'active' }],
    workflow_actions: [
      { id: 'step1', workflowId: 'w1', type: 'send_email', params: { template: 'welcome' } }
    ]
  };

  beforeAll(async () => {
    db = new SqliteDatabase(':memory:');
    await db.init();
    
    enrollmentsRepo = new TypeOrmEnrollmentRepository(db.dataSource);
    historyRepo = new TypeOrmExecutionHistoryRepository(db.dataSource);
    
    engine = new WorkflowEngine(enrollmentsRepo, historyRepo);
    engine.loadSchema(sampleSchema);

    app = createServer(engine, historyRepo, enrollmentsRepo);
  });

  afterAll(async () => {
    await engine.stopWorker();
    await db.dataSource.destroy();
  });

  it('should return 400 if event name is missing', async () => {
    const res = await request(app).post('/api/events').send({
      contact: { id: 'c1' }
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body.error.type).toEqual('ValidationError');
  });

  it('should return 400 if event has no mapped workflows', async () => {
    const res = await request(app).post('/api/events').send({
      eventName: 'unknown_event',
      contact: { id: 'c1' }
    });
    expect(res.statusCode).toEqual(400);
    expect(res.body.error.type).toEqual('EventNotTriggered');
  });

  it('should process event and return enrollment IDs', async () => {
    const res = await request(app).post('/api/events').send({
      eventName: 'user_signed_up',
      contact: { 
        id: 'c2',
        email: 'test@example.com',
        tags: ['admin']
      }
    });
    
    expect(res.statusCode).toEqual(202);
    expect(res.body.data.message).toEqual('Event accepted');
    expect(res.body.data.workflowsTriggered).toEqual(1);
    
    // Verify the enrollmentId is present in the response
    expect(res.body.data.enrollmentIds).toBeDefined();
    expect(Array.isArray(res.body.data.enrollmentIds)).toBeTruthy();
    expect(res.body.data.enrollmentIds.length).toEqual(1);
    
    // Check that we can fetch the history for this contact later
    const historyRes = await request(app).get('/api/contacts/c2/history');
    expect(historyRes.statusCode).toEqual(200);
    expect(historyRes.body.data.length).toEqual(1);
    expect(historyRes.body.data[0].enrollmentId).toEqual(res.body.data.enrollmentIds[0]);
  });
});
