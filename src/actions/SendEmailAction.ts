import { Action } from './Action';
import { Enrollment, RelationalWorkflowAction, ExecutionResult, ExecutionResultType } from '../types';

export class SendEmailAction implements Action {
  async execute(enrollment: Enrollment, stepDef: RelationalWorkflowAction): Promise<ExecutionResult> {
    const contact = enrollment.context?.contact;
    if (!contact) {
      return { type: ExecutionResultType.FAIL, error: 'Contact context is missing in enrollment' };
    }

    const template = stepDef.params?.template || 'default';
    
    // Stub logic for demonstration
    console.log(`Sending email template '${template}' to contact ${contact.id} (${contact.email || 'no-email'})`);

    // TODO [PRODUCTION]: Decouple email dispatch by offloading to an asynchronous transactional email
    // worker (e.g., SendGrid/AWS SES via Kafka/SQS).
    // The engine should put the enrollment into WAITING_FOR_RESPONSE and await a delivery/bounce webhook callback.
    return {
      type: ExecutionResultType.PROCEED,
      nextStepId: stepDef.nextStepId,
      logs: { 
        action: 'send_email', 
        template, 
        sentTo: contact.email || null,
        recipientId: contact.id
      }
    };
  }
}

