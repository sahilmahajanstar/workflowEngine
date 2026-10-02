import { ConditionEvaluator } from './ConditionEvaluator';
import { Enrollment } from '../types';

export class HasTagCondition implements ConditionEvaluator {
  evaluate(enrollment: Enrollment, params: any): boolean {
    const { contact } = enrollment.context;
    return Array.isArray(contact.tags) && contact.tags.includes(params.tag);
  }
}
