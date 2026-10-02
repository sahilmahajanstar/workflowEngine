import { ConditionEvaluator } from './ConditionEvaluator';
import { HasTagCondition } from './HasTagCondition';
import { JexlCondition } from './JexlCondition';

export class ConditionFactory {
  private static evaluators: Map<string, ConditionEvaluator> = new Map<string, ConditionEvaluator>([
    ['has_tag', new HasTagCondition()],
    ['jexl', new JexlCondition()]
  ]);

  /**
   * Register a new custom condition evaluator dynamically at runtime (Open-Closed Principle).
   */
  static registerEvaluator(type: string, evaluator: ConditionEvaluator): void {
    this.evaluators.set(type, evaluator);
  }

  static getEvaluator(type: string): ConditionEvaluator {
    const evaluator = this.evaluators.get(type);
    if (!evaluator) {
      throw new Error(`Unknown condition type: ${type}`);
    }
    return evaluator;
  }
}
