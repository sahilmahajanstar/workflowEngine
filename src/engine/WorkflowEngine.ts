import { logger } from '../utils/Logger';
import { IEnrollmentRepository } from '../db/repositories/IEnrollmentRepository';
import { IExecutionHistoryRepository } from '../db/repositories/IExecutionHistoryRepository';
import { RelationalSchema, Contact, Enrollment, EnrollmentStatus, ExecutionResultType } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { ActionFactory } from '../actions/ActionFactory';

import { IExecutionQueue } from '../queue/IExecutionQueue';
import { MemoryExecutionQueue } from '../queue/MemoryExecutionQueue';

export class WorkflowEngine {
  private schema: RelationalSchema = {
    workflows: [],
    triggers: [],
    workflow_triggers: [],
    workflow_actions: []
  };
  private enrollments: IEnrollmentRepository;
  private history: IExecutionHistoryRepository;
  private executionQueue: IExecutionQueue;

  constructor(enrollments: IEnrollmentRepository, history: IExecutionHistoryRepository, queue?: IExecutionQueue) {
    this.enrollments = enrollments;
    this.history = history;
    this.executionQueue = queue || new MemoryExecutionQueue(async (enrollment) => {
      await this.execute(enrollment);
    });
  }

  private stateHandlers: Record<ExecutionResultType, (enrollment: Enrollment, result: any, stepDef: any) => boolean> = {
    [ExecutionResultType.PROCEED]: (enrollment, result, stepDef) => {
      if (result.nextStepId) {
        enrollment.currentStepId = result.nextStepId;
      } else {
        enrollment.status = EnrollmentStatus.COMPLETED;
        enrollment.currentStepId = null;
      }
      return true; // continue
    },
    [ExecutionResultType.WAIT]: (enrollment, result, stepDef) => {
      enrollment.status = EnrollmentStatus.WAITING;
      enrollment.waitUntil = result.waitUntil || null;
      enrollment.currentStepId = stepDef.nextStepId || null;
      return false; // break and wait
    },
    [ExecutionResultType.WAITING_FOR_RESPONSE]: (enrollment, result, stepDef) => {
      enrollment.status = EnrollmentStatus.WAITING_FOR_RESPONSE;
      return false;
    },
    [ExecutionResultType.ERROR]: (enrollment, result, stepDef) => {
      enrollment.status = EnrollmentStatus.ERROR;
      return false;
    },
    [ExecutionResultType.FAIL]: (enrollment, result, stepDef) => {
      enrollment.status = EnrollmentStatus.FAILED;
      return false;
    }
  };

  async stopWorker() {
    await this.executionQueue.close();
  }

  loadSchema(schema: RelationalSchema) {
    const activeWorkflows = (schema.workflows || []).filter(w => w.status === 'active');
    const activeWorkflowIds = activeWorkflows.map(w => w.id);

    this.schema.workflows.push(...activeWorkflows);
    this.schema.triggers.push(...(schema.triggers || []));
    this.schema.workflow_triggers.push(
      ...(schema.workflow_triggers || []).filter(wt => activeWorkflowIds.includes(wt.workflowId) && wt.status === 'active')
    );
    this.schema.workflow_actions.push(...(schema.workflow_actions || []).filter(wa => activeWorkflowIds.includes(wa.workflowId)));
  }

  async recoverRunning() {
    const running = await this.enrollments.getByStatus(EnrollmentStatus.RUNNING);
    for (const enrollment of running) {
      logger.info(`Recovering stuck RUNNING enrollment: ${enrollment.id}`);
      await this.executionQueue.push(enrollment);
    }
  }

  async processEvent(eventName: string, contact: Contact): Promise<Enrollment[]> {
    // 1. Find all triggers matching the eventName
    const triggers = this.schema.triggers.filter(t => t.eventName === eventName);
    const triggerIds = triggers.map(t => t.id);

    // 2. Find all workflow_triggers mapped to those triggers
    const workflowTriggers = this.schema.workflow_triggers.filter(wt => triggerIds.includes(wt.triggerId));

    // 3. Enroll contact in each mapped workflow
    const enrollments: Enrollment[] = [];
    for (const wt of workflowTriggers) {
      const enrollment = await this.enrollContact(wt.workflowId, wt.initialStepId, contact);
      enrollments.push(enrollment);
    }
    
    return enrollments;
  }

  private async enrollContact(workflowId: string, initialStepId: string, contact: Contact): Promise<Enrollment> {
    const enrollment: Enrollment = {
      id: uuidv4(),
      workflowId: workflowId,
      contactId: contact.id,
      currentStepId: initialStepId,
      status: EnrollmentStatus.RUNNING,
      waitUntil: null,
      context: { contact }
    };

    await this.enrollments.create(enrollment);
    
    // Push to internal queue instead of executing directly
    await this.executionQueue.push(enrollment);
    
    return enrollment;
  }

  async execute(enrollment: Enrollment) {
    if (enrollment.status === EnrollmentStatus.COMPLETED || enrollment.status === EnrollmentStatus.FAILED) {
      return;
    }

    const workflow = this.schema.workflows.find(w => w.id === enrollment.workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${enrollment.workflowId} not found`);
    }

    while (enrollment.currentStepId && enrollment.status === EnrollmentStatus.RUNNING) {
      const stepDef = this.schema.workflow_actions.find(a => a.workflowId === enrollment.workflowId && a.id === enrollment.currentStepId);
      
      if (!stepDef) {
        enrollment.status = EnrollmentStatus.FAILED;
        await this.enrollments.update(enrollment);
        await this.history.log(enrollment.id, enrollment.currentStepId, 'failed', { error: 'Step not found' });
        break;
      }

      try {
        // TODO [PRODUCTION]: Introduce an Idempotency Key (e.g. `enrollment.id + currentStepId + attemptCount`) 
        // to pass to external workers (like Webhooks or Emails). If the node crashes here before the DB 
        // updates, the retry will safely hit the external service without duplicating actions.
        const action = ActionFactory.getAction(stepDef.type);
        const result = await action.execute(enrollment, stepDef as any);

        const logs = result.logs || (result.error ? { error: result.error } : {});
        await this.history.log(enrollment.id, enrollment.currentStepId, result.type.toLowerCase(), logs);

        const handler = this.stateHandlers[result.type];
        if (!handler) {
          throw new Error(`Unknown execution result type: ${result.type}`);
        }

        const shouldContinue = handler(enrollment, result, stepDef);
        await this.enrollments.update(enrollment);

        if (!shouldContinue) {
          break;
        }
      } catch (err: any) {
        const stepId = enrollment.currentStepId || 'unknown';
        // TODO [PRODUCTION]: Implement Exponential Backoff Retries. If retry count exceeds MaxRetries,
        // route the enrollment to a Dead Letter Queue (DLQ) rather than failing it immediately.
        enrollment.status = EnrollmentStatus.FAILED;
        await this.enrollments.update(enrollment);
        await this.history.log(enrollment.id, stepId, 'error', { error: err.message });
        break;
      }
    }

    // Wait complete handling removed as we handle it cleanly in resumeWaiting
  }

  async resumeWaiting() {
    const now = Date.now();
    const pending = await this.enrollments.getPendingWaits(now);
    for (const enrollment of pending) {
      enrollment.waitUntil = null;
      
      // If there is no next step, the workflow is finished after the wait
      if (!enrollment.currentStepId) {
         enrollment.status = EnrollmentStatus.COMPLETED;
      } else {
         enrollment.status = EnrollmentStatus.RUNNING;
      }

      await this.enrollments.update(enrollment);
      if (enrollment.status === EnrollmentStatus.RUNNING) {
         await this.executionQueue.push(enrollment);
      }
    }
  }
}
