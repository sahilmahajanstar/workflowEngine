import { WorkflowActionSchema, RelationalSchemaValidator } from '../src/validation/WorkflowSchema';

describe('WorkflowSchema Validation', () => {
  describe('WorkflowActionSchema', () => {
    it('should validate a correct send_email action', () => {
      const action = {
        id: 'step_1',
        workflowId: 'w1',
        type: 'send_email',
        params: { template: 'welcome' },
        nextStepId: 'step_2'
      };
      const result = WorkflowActionSchema.safeParse(action);
      expect(result.success).toBe(true);
    });

    it('should invalidate wait action without durationMs', () => {
      const action = {
        id: 'step_2',
        workflowId: 'w1',
        type: 'wait',
        params: { }, // missing durationMs
        nextStepId: 'step_3'
      };
      const result = WorkflowActionSchema.safeParse(action);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('durationMs (number) is required');
      }
    });

    it('should validate wait action with durationMs', () => {
      const action = {
        id: 'step_2',
        workflowId: 'w1',
        type: 'wait',
        params: { durationMs: 5000 },
        nextStepId: 'step_3'
      };
      const result = WorkflowActionSchema.safeParse(action);
      expect(result.success).toBe(true);
    });

    it('should invalidate condition action without conditions array', () => {
      const action = {
        id: 'step_3',
        workflowId: 'w1',
        type: 'condition',
        params: { defaultBranch: 'no' }, // missing conditions
        branches: { yes: 'step_4', no: 'step_5' }
      };
      const result = WorkflowActionSchema.safeParse(action);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('conditions array is required');
      }
    });

    it('should invalidate condition action without defaultBranch', () => {
      const action = {
        id: 'step_3',
        workflowId: 'w1',
        type: 'condition',
        params: { conditions: [] }, // missing defaultBranch
        branches: { yes: 'step_4', no: 'step_5' }
      };
      const result = WorkflowActionSchema.safeParse(action);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('defaultBranch (string) is required');
      }
    });

    it('should validate correct condition action', () => {
      const action = {
        id: 'step_3',
        workflowId: 'w1',
        type: 'condition',
        params: { 
          conditions: [{ type: 'has_tag', params: { tag: 'vip' }, branch: 'yes' }],
          defaultBranch: 'no'
        },
        branches: { yes: 'step_4', no: 'step_5' }
      };
      const result = WorkflowActionSchema.safeParse(action);
      expect(result.success).toBe(true);
    });
  });

  describe('RelationalSchemaValidator', () => {
    it('should validate a full valid schema', () => {
      const schema = {
        workflows: [{ id: 'w1', name: 'Test' }],
        triggers: [{ id: 't1', eventName: 'test_event' }],
        workflow_triggers: [{ workflowId: 'w1', triggerId: 't1', initialStepId: 'step_1' }],
        workflow_actions: [
          {
            id: 'step_1',
            workflowId: 'w1',
            type: 'wait',
            params: { durationMs: 1000 },
            nextStepId: null
          }
        ]
      };
      const result = RelationalSchemaValidator.safeParse(schema);
      expect(result.success).toBe(true);
    });
  });
});
