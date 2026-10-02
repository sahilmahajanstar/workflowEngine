import { logger } from '../utils/Logger';
import { ConditionEvaluator } from './ConditionEvaluator';
import { Enrollment } from '../types';
import jexl from 'jexl';
import { z } from 'zod';

// Define the schema for the parameters this condition expects
const JexlConditionParamsSchema = z.object({
  expression: z.string().min(1, "Expression string is required"),
});

// Type inference from Zod schema
type JexlConditionParams = z.infer<typeof JexlConditionParamsSchema>;

export class JexlCondition implements ConditionEvaluator {

  async evaluate(enrollment: Enrollment, params: any): Promise<boolean> {
    // 1. Validate the params schema
    const parsedParams = JexlConditionParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      logger.error('Invalid parameters for JexlCondition:', parsedParams.error);
      return false; // Fail safe
    }

    const { expression } = parsedParams.data;

    try {
      // 2. Evaluate the expression against the enrollment context
      // Note: evaluate can be async in jexl if context getters are promises, so we use await
      const result = await jexl.eval(expression, enrollment.context);
      
      // Force boolean return
      return Boolean(result);
    } catch (error) {
      logger.error(`Failed to evaluate jexl expression: ${expression}`, error);
      return false; // Fail safe
    }
  }
}
