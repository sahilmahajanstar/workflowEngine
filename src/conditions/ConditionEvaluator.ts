import { Enrollment } from '../types';

export interface ConditionEvaluator {
  evaluate(enrollment: Enrollment, params: any): boolean | Promise<boolean>;
}
