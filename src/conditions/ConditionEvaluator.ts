import { Enrollment } from '../types';

export interface ConditionEvaluator<T = any> {
  evaluate(enrollment: Enrollment, params: T): boolean | Promise<boolean>;
}
