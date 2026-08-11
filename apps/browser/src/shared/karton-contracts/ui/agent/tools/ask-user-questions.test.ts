import { describe, expect, it } from 'vitest';
import {
  askUserQuestionsToolInputSchema,
  askUserQuestionsToolInputSchemaFlat,
} from './ask-user-questions';

const input = (fields: unknown[]) => ({
  title: 'Questions',
  steps: [{ fields }],
});

describe('askUserQuestionsToolInputSchema', () => {
  it('rejects fields that only satisfy the flattened model schema', () => {
    const flattened = askUserQuestionsToolInputSchemaFlat.parse(
      input([{ type: 'radio-group', questionId: 'mode', label: 'Mode' }]),
    );

    expect(() => askUserQuestionsToolInputSchema.parse(flattened)).toThrow();
  });

  it('rejects duplicate question IDs', () => {
    expect(() =>
      askUserQuestionsToolInputSchema.parse(
        input([
          { type: 'input', questionId: 'name', label: 'First name' },
          { type: 'input', questionId: 'name', label: 'Last name' },
        ]),
      ),
    ).toThrow('questionId values must be unique');
  });
});
