import { z } from 'zod';

export const WorkflowSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
});

export const TriggerSchema = z.object({
  id: z.string(),
  eventName: z.string(),
});

export const WorkflowTriggerSchema = z.object({
  workflowId: z.string(),
  triggerId: z.string(),
  initialStepId: z.string(),
});

export const WorkflowActionSchema = z.object({
  id: z.string(),
  workflowId: z.string(),
  type: z.string(),
  params: z.any().optional(),
  nextStepId: z.string().nullable().optional(),
  branches: z.record(z.string(), z.string()).optional(),
}).superRefine((data, ctx) => {
  if (data.type === 'wait') {
    if (typeof data.params?.durationMs !== 'number') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "durationMs (number) is required in params for 'wait' action",
        path: ['params', 'durationMs']
      });
    }
  } else if (data.type === 'condition') {
    if (!Array.isArray(data.params?.conditions)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "conditions array is required in params for 'condition' action",
        path: ['params', 'conditions']
      });
    }
    if (typeof data.params?.defaultBranch !== 'string') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "defaultBranch (string) is required in params for 'condition' action",
        path: ['params', 'defaultBranch']
      });
    }
  }
});

export const RelationalSchemaValidator = z.object({
  workflows: z.array(WorkflowSchema),
  triggers: z.array(TriggerSchema),
  workflow_triggers: z.array(WorkflowTriggerSchema),
  workflow_actions: z.array(WorkflowActionSchema),
});
