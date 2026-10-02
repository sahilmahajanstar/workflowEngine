import { JexlCondition } from '../src/conditions/JexlCondition';
import { Enrollment, EnrollmentStatus } from '../src/types';

describe('JexlCondition', () => {
  let evaluator: JexlCondition;
  let enrollment: Enrollment;

  beforeEach(() => {
    evaluator = new JexlCondition();
    enrollment = {
      id: 'enrollment-1',
      workflowId: 'w-1',
      contactId: 'c-1',
      currentStepId: 'step-1',
      status: EnrollmentStatus.RUNNING,
      waitUntil: null,
      context: { 
        contact: { id: 'c-1', tags: ['vip', 'admin'] },
        otherData: {
          age: 25,
          isActive: true
        }
      }
    };
  });

  it('should return true for a valid matching expression', async () => {
    const result = await evaluator.evaluate(enrollment, { 
      expression: 'otherData.age > 18 && otherData.isActive == true' 
    });
    expect(result).toBe(true);
  });

  it('should return false for a non-matching expression', async () => {
    const result = await evaluator.evaluate(enrollment, { 
      expression: 'otherData.age < 18' 
    });
    expect(result).toBe(false);
  });

  it('should support the native in operator for arrays', async () => {
    // Check if 'admin' is in tags
    let result = await evaluator.evaluate(enrollment, { 
      expression: "'admin' in contact.tags" 
    });
    expect(result).toBe(true);

    // Check a non-existent tag
    result = await evaluator.evaluate(enrollment, { 
      expression: "'newbie' in contact.tags" 
    });
    expect(result).toBe(false);
  });

  it('should return false gracefully if the expression is malformed', async () => {
    // Simulate a bad expression string
    const result = await evaluator.evaluate(enrollment, { 
      expression: 'contact.age >>>>' 
    });
    expect(result).toBe(false);
  });

  it('should return false if params fail Zod validation', async () => {
    // Empty expression string
    let result = await evaluator.evaluate(enrollment, { expression: '' });
    expect(result).toBe(false);

    // Missing expression completely
    result = await evaluator.evaluate(enrollment, {});
    expect(result).toBe(false);
  });
});
