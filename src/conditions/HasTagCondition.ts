import { ConditionEvaluator } from './ConditionEvaluator';
import { Enrollment } from '../types';

export class HasTagCondition implements ConditionEvaluator {
  evaluate(enrollment: Enrollment, params: { tag: string }): boolean {
    const { contact } = enrollment.context;
    if (!contact || !contact.tags) return false;
    return contact.tags.includes(params.tag);
  }
}
