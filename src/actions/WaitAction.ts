import { Action } from './Action';
import { Enrollment, RelationalWorkflowAction, ExecutionResult, ExecutionResultType } from '../types';
import { Clock } from '../utils/Clock';

export class WaitAction implements Action {
  async execute(enrollment: Enrollment, stepDef: RelationalWorkflowAction): Promise<ExecutionResult> {
    const durationMs = stepDef.params?.durationMs || 0;
    
    // Testable wait using our custom Clock.
    // In tests, we can advance the Clock manually.
    const waitUntil = new Date(Clock.now() + durationMs);

    return {
      type: ExecutionResultType.WAIT,
      waitUntil,
      logs: { action: 'wait', durationMs, waitUntil }
    };
  }
}
