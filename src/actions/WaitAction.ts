import { Action } from './Action';
import { Enrollment, RelationalWorkflowAction, ExecutionResult, ExecutionResultType } from '../types';

export class WaitAction implements Action {
  async execute(enrollment: Enrollment, stepDef: RelationalWorkflowAction): Promise<ExecutionResult> {
    const durationMs = stepDef.params?.durationMs || 0;
    
    // Testable wait: If duration is provided, we use it. Otherwise 0.
    // In tests, we can manually change the `waitUntil` in the DB or pass 0.
    const waitUntil = new Date(Date.now() + durationMs);

    return {
      type: ExecutionResultType.WAIT,
      waitUntil,
      logs: { action: 'wait', durationMs, waitUntil }
    };
  }
}
