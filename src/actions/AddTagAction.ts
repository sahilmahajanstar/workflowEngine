import { Action } from './Action';
import { Enrollment, RelationalWorkflowAction, ExecutionResult, ExecutionResultType } from '../types';

export class AddTagAction implements Action {
  async execute(enrollment: Enrollment, stepDef: RelationalWorkflowAction): Promise<ExecutionResult> {
    const contact = enrollment.context?.contact;
    if (!contact) {
      return { type: ExecutionResultType.FAIL, error: 'Contact context is missing in enrollment' };
    }

    const tag = stepDef.params?.tag;
    if (!tag) {
      return { type: ExecutionResultType.FAIL, error: 'Tag parameter missing' };
    }

    if (!contact.tags) {
      contact.tags = [];
    }
    
    if (!contact.tags.includes(tag)) {
      contact.tags.push(tag);
    }
    
    return {
      type: ExecutionResultType.PROCEED,
      nextStepId: stepDef.nextStepId,
      logs: { action: 'add_tag', tag, contactTags: contact.tags }
    };
  }
}
