import { Action } from './Action';
import { SendEmailAction } from './SendEmailAction';
import { AddTagAction } from './AddTagAction';
import { CallWebhookAction } from './CallWebhookAction';
import { WaitAction } from './WaitAction';
import { ConditionAction } from './ConditionAction';

export class ActionFactory {
  private static actions: Map<string, Action> = new Map<string, Action>([
    ['send_email', new SendEmailAction()],
    ['add_tag', new AddTagAction()],
    ['call_webhook', new CallWebhookAction()],
    ['wait', new WaitAction()],
    ['condition', new ConditionAction()]
  ]);

  /**
   * Register a new custom action type dynamically at runtime (Open-Closed Principle).
   */
  static registerAction(type: string, action: Action): void {
    this.actions.set(type, action);
  }

  static getAction(type: string): Action {
    const action = this.actions.get(type);
    if (!action) {
      throw new Error(`Unknown action type: ${type}`);
    }
    return action;
  }
}

