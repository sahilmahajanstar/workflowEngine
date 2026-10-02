import { Action } from './Action';
import { Enrollment, RelationalWorkflowAction, ExecutionResult, ExecutionResultType } from '../types';

export class CallWebhookAction implements Action {
  async execute(enrollment: Enrollment, stepDef: RelationalWorkflowAction): Promise<ExecutionResult> {
    const url = stepDef.params?.url;
    
    if (!url) {
      return { type: ExecutionResultType.FAIL, error: 'Webhook URL missing' };
    }

    const contact = enrollment.context?.contact;
    if (!contact) {
      return { type: ExecutionResultType.FAIL, error: 'Contact context is missing in enrollment' };
    }

    let timeoutId: NodeJS.Timeout | undefined;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 5000); // 5 sec timeout
      if (typeof timeoutId.unref === 'function') {
        timeoutId.unref();
      }

      // TODO [PRODUCTION]: Include Idempotency-Key header (e.g. `${enrollment.id}:${stepDef.id}`)
      // to guarantee safe retries across network failures without duplicate webhook processing.
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Enrollment-ID': enrollment.id,
          'X-Step-ID': stepDef.id
        },
        body: JSON.stringify(contact),
        signal: controller.signal
      });

      if (!response.ok) {
        // 4xx errors are usually bad payloads (Terminal FAIL)
        if (response.status >= 400 && response.status < 500) {
          return { type: ExecutionResultType.FAIL, error: `Webhook failed with client error status ${response.status}` };
        }
        // 5xx errors are server issues (Retriable ERROR)
        return { type: ExecutionResultType.ERROR, error: `Webhook failed with server error status ${response.status}` };
      }

      return {
        type: ExecutionResultType.PROCEED,
        nextStepId: stepDef.nextStepId,
        logs: { action: 'call_webhook', url, status: response.status }
      };
    } catch (err: any) {
      // Network failures (ECONNREFUSED, timeout) are retriable
      return { type: ExecutionResultType.ERROR, error: `Webhook network error: ${err.message}` };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}
