import { Enrollment, RelationalWorkflowAction, ExecutionResult } from '../types';

export interface Action {
  execute(enrollment: Enrollment, stepDef: RelationalWorkflowAction): Promise<ExecutionResult>;
}
