import { SqliteDatabase } from '../src/db/SqliteDatabase';
import { TypeOrmEnrollmentRepository } from '../src/db/repositories/TypeOrmEnrollmentRepository';
import { TypeOrmExecutionHistoryRepository } from '../src/db/repositories/TypeOrmExecutionHistoryRepository';
import { ExecutionHistory, RelationalSchema } from '../src/types';
import { WorkflowEngine } from '../src/engine/WorkflowEngine';

describe('WorkflowEngine', () => {
  let db: SqliteDatabase;
  let engine: WorkflowEngine;

  const sampleSchema: RelationalSchema = {
    workflows: [{ id: 'w1' }],
    triggers: [{ id: 't1', eventName: 'test_event' }],
    workflow_triggers: [{ workflowId: 'w1', triggerId: 't1', initialStepId: 'step1' }],
    workflow_actions: [
      { id: 'step1', workflowId: 'w1', type: 'send_email', params: { template: 'test' }, nextStepId: 'step2' },
      { id: 'step2', workflowId: 'w1', type: 'wait', params: { durationMs: 0 }, nextStepId: 'step3' },
      { id: 'step3', workflowId: 'w1', type: 'condition', params: { conditions: [{ type: 'has_tag', params: { tag: 'replied' }, branch: 'yes' }], defaultBranch: 'no' }, branches: { yes: 'step4_yes', no: 'step4_no' } },
      { id: 'step4_yes', workflowId: 'w1', type: 'add_tag', params: { tag: 'tested_yes' } },
      { id: 'step4_no', workflowId: 'w1', type: 'add_tag', params: { tag: 'tested_no' } }
    ]
  };

  beforeEach(async () => {
    // use in-memory sqlite
    db = new SqliteDatabase(':memory:');
    await db.init();
    
    const enrollmentsRepo = new TypeOrmEnrollmentRepository(db.dataSource);
    const historyRepo = new TypeOrmExecutionHistoryRepository(db.dataSource);
    
    engine = new WorkflowEngine(enrollmentsRepo, historyRepo);
    engine.loadSchema(sampleSchema);
  });

  it('should process event and execute steps', async () => {
    const contact = { id: 'c1', tags: [] };
    
    await engine.processEvent('test_event', contact);

    // Give it a moment to run async execution
    // Give it a moment to run async execution
    await new Promise(resolve => setTimeout(resolve, 500));

    // Wait step pauses execution since we simulate it returning WAIT
    // But duration is 0, so poller should pick it up if we call resumeWaiting
    await engine.resumeWaiting();
    await engine.resumeWaiting();
    await new Promise(resolve => setTimeout(resolve, 500));

    const historyRepo = new TypeOrmExecutionHistoryRepository(db.dataSource);
    const history = await historyRepo.getByContactId('c1');
    expect(history.length).toBeGreaterThan(0);
    
    // Check tags updated by step3
    const waitRow = history.find((h: ExecutionHistory) => h.stepId === 'step2' && h.status === 'wait');
    expect(waitRow).toBeDefined();

    const addTagRow = history.find((h: ExecutionHistory) => (h.stepId === 'step4_yes' || h.stepId === 'step4_no') && h.status === 'proceed');
    expect(addTagRow).toBeDefined();
  });

  afterEach(async () => {
    if (engine) await engine.stopWorker();
    if (db && db.dataSource) await db.dataSource.destroy();
  });
});
