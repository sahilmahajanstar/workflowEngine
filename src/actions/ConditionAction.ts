import { Action } from './Action';
import { Enrollment, RelationalWorkflowAction, ExecutionResult, ExecutionResultType } from '../types';
import { ConditionFactory } from '../conditions/ConditionFactory';

export class ConditionAction implements Action {
  async execute(enrollment: Enrollment, stepDef: RelationalWorkflowAction): Promise<ExecutionResult> {
    const { conditions, defaultBranch } = stepDef.params || {};

    let matchedBranch: string | undefined;
    let matchedConditionType = 'default';

    if (conditions && Array.isArray(conditions)) {
      for (const cond of conditions) {
        const evaluator = ConditionFactory.getEvaluator(cond.type);
        const isMatch = await evaluator.evaluate(enrollment, cond.params);
        if (isMatch) {
          matchedBranch = cond.branch;
          matchedConditionType = cond.type;
          break;
        }
      }
    }

    if (!matchedBranch) {
      matchedBranch = defaultBranch;
    }

    const nextStepId = matchedBranch && stepDef.branches ? stepDef.branches[matchedBranch] : null;

    return {
      type: ExecutionResultType.PROCEED,
      nextStepId: nextStepId || null,
      logs: { matchedCondition: matchedConditionType, branch: matchedBranch }
    };
  }
}
