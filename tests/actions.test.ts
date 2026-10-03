import { ConditionAction } from '../src/actions/ConditionAction';
import { WaitAction } from '../src/actions/WaitAction';
import { SendEmailAction } from '../src/actions/SendEmailAction';
import { CallWebhookAction } from '../src/actions/CallWebhookAction';
import { Enrollment, EnrollmentStatus, ExecutionResultType } from '../src/types';
import { Clock, TestableClock } from '../src/utils/Clock';

describe('Actions', () => {
  let enrollment: Enrollment;

  beforeEach(() => {
    enrollment = {
      id: 'enrollment-1',
      workflowId: 'w-1',
      contactId: 'c-1',
      currentStepId: 'step-1',
      status: EnrollmentStatus.RUNNING,
      waitUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      context: { contact: { id: 'c-1', tags: ['vip'] } }
    };
  });

  describe('ConditionAction', () => {
    it('should route to matched condition branch', async () => {
      const action = new ConditionAction();
      const stepDef = {
        id: 'step-1',
        workflowId: 'w-1',
        type: 'condition',
        params: {
          conditions: [
            { type: 'has_tag', params: { tag: 'vip' }, branch: 'yes' }
          ],
          defaultBranch: 'no'
        },
        branches: {
          yes: 'step-yes',
          no: 'step-no'
        }
      };

      const result = await action.execute(enrollment, stepDef as any);
      expect(result.type).toBe(ExecutionResultType.PROCEED);
      expect(result.nextStepId).toBe('step-yes');
      expect(result.logs?.branch).toBe('yes');
    });

    it('should route to default branch if no conditions match', async () => {
      const action = new ConditionAction();
      const stepDef = {
        id: 'step-1',
        workflowId: 'w-1',
        type: 'condition',
        params: {
          conditions: [
            { type: 'has_tag', params: { tag: 'non-existent' }, branch: 'yes' }
          ],
          defaultBranch: 'no'
        },
        branches: {
          yes: 'step-yes',
          no: 'step-no'
        }
      };

      const result = await action.execute(enrollment, stepDef as any);
      expect(result.type).toBe(ExecutionResultType.PROCEED);
      expect(result.nextStepId).toBe('step-no');
      expect(result.logs?.branch).toBe('no');
    });
  });

  describe('WaitAction', () => {
    let testClock: TestableClock;

    beforeEach(() => {
      testClock = new TestableClock(1000000000000); // arbitrary start time
      Clock.set(testClock);
    });

    afterEach(() => {
      Clock.reset();
    });

    it('should return WAIT with future date based on Clock', async () => {
      const action = new WaitAction();
      const stepDef = {
        id: 'step-wait',
        workflowId: 'w-1',
        type: 'wait',
        params: { durationMs: 10000 },
        nextStepId: 'step-after'
      };

      const result = await action.execute(enrollment, stepDef as any);
      
      expect(result.type).toBe(ExecutionResultType.WAIT);
      expect(result.waitUntil).toBeInstanceOf(Date);
      expect(result.waitUntil!.getTime()).toBe(1000000010000);
    });
  });
  
  describe('SendEmailAction', () => {
    it('should return PROCEED and format logs', async () => {
      const action = new SendEmailAction();
      const stepDef = {
        id: 'step-email',
        workflowId: 'w-1',
        type: 'send_email',
        params: { template: 'welcome' },
        nextStepId: 'step-next'
      };

      const result = await action.execute(enrollment, stepDef as any);
      
      expect(result.type).toBe(ExecutionResultType.PROCEED);
      expect(result.nextStepId).toBe('step-next');
      expect(result.logs?.template).toBe('welcome');
    });
  });

  describe('CallWebhookAction', () => {
    let originalFetch: any;

    beforeAll(() => {
      originalFetch = global.fetch;
    });

    afterAll(() => {
      global.fetch = originalFetch;
    });

    it('should return PROCEED on 200 OK', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
        })
      ) as any;

      const action = new CallWebhookAction();
      const stepDef = {
        id: 'step-hook',
        workflowId: 'w-1',
        type: 'call_webhook',
        params: { url: 'http://example.com' },
        nextStepId: 'step-next'
      };

      const result = await action.execute(enrollment, stepDef as any);
      expect(result.type).toBe(ExecutionResultType.PROCEED);
      expect(result.nextStepId).toBe('step-next');
    });

    it('should return FAIL on 400 Bad Request', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 400,
        })
      ) as any;

      const action = new CallWebhookAction();
      const stepDef = {
        id: 'step-hook',
        workflowId: 'w-1',
        type: 'call_webhook',
        params: { url: 'http://example.com' }
      };

      const result = await action.execute(enrollment, stepDef as any);
      expect(result.type).toBe(ExecutionResultType.FAIL);
    });

    it('should return ERROR on 500 Server Error', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
        })
      ) as any;

      const action = new CallWebhookAction();
      const stepDef = {
        id: 'step-hook',
        workflowId: 'w-1',
        type: 'call_webhook',
        params: { url: 'http://example.com' }
      };

      const result = await action.execute(enrollment, stepDef as any);
      expect(result.type).toBe(ExecutionResultType.ERROR);
    });

    it('should return ERROR on network failure', async () => {
      global.fetch = jest.fn(() => Promise.reject(new Error('ECONNREFUSED'))) as any;

      const action = new CallWebhookAction();
      const stepDef = {
        id: 'step-hook',
        workflowId: 'w-1',
        type: 'call_webhook',
        params: { url: 'http://example.com' }
      };

      const result = await action.execute(enrollment, stepDef as any);
      expect(result.type).toBe(ExecutionResultType.ERROR);
    });
  });
});
