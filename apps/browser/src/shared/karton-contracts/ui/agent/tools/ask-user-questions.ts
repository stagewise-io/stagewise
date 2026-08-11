import * as z from 'zod/v4';

const questionFieldOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});
const questionFieldBase = {
  questionId: z.string(),
  label: z.string(),
  description: z.string().optional(),
};

const inputFieldSchema = z.object({
  ...questionFieldBase,
  type: z.literal('input'),
  inputType: z.enum(['text', 'email', 'number', 'password']).optional(),
  placeholder: z.string().optional(),
  defaultValue: z.union([z.string(), z.number()]).optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  required: z.boolean().optional(),
});

const radioGroupFieldSchema = z.object({
  ...questionFieldBase,
  type: z.literal('radio-group'),
  options: z.array(questionFieldOptionSchema).min(1),
  defaultValue: z.string().optional(),
  required: z.boolean().optional(),
  allowOther: z.boolean().optional(),
});

const checkboxFieldSchema = z.object({
  ...questionFieldBase,
  type: z.literal('checkbox'),
  defaultValue: z.boolean().optional(),
});

const checkboxGroupFieldSchema = z.object({
  ...questionFieldBase,
  type: z.literal('checkbox-group'),
  options: z.array(questionFieldOptionSchema).min(1),
  defaultValues: z.array(z.string()).optional(),
  required: z.boolean().optional(),
});

export const questionFieldSchema = z.discriminatedUnion('type', [
  inputFieldSchema,
  radioGroupFieldSchema,
  checkboxFieldSchema,
  checkboxGroupFieldSchema,
]);

export type QuestionField = z.infer<typeof questionFieldSchema>;

const questionFieldFlatSchema = z.object({
  ...questionFieldBase,
  type: z.enum(['input', 'radio-group', 'checkbox', 'checkbox-group']),
  inputType: z.enum(['text', 'email', 'number', 'password']).optional(),
  placeholder: z.string().optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  required: z.boolean().optional(),
  options: z.array(questionFieldOptionSchema).min(1).optional(),
  allowOther: z.boolean().optional(),
  defaultValues: z.array(z.string()).optional(),
});

const form = <T extends z.ZodType<{ questionId: string }>>(field: T) =>
  z
    .object({
      title: z.string().describe('Form title shown in the collapsible header.'),
      description: z
        .string()
        .optional()
        .describe('Optional top-level description.'),
      steps: z
        .array(
          z.object({
            title: z.string().optional(),
            description: z.string().optional(),
            fields: z.array(field).min(1).max(10),
          }),
        )
        .min(1)
        .max(5)
        .describe('Array of form steps. Single-step forms have one entry.'),
    })
    .refine(
      (value) => {
        const ids = value.steps.flatMap((step) =>
          step.fields.map((question) => question.questionId),
        );
        return new Set(ids).size === ids.length;
      },
      { message: 'questionId values must be unique' },
    );

export const askUserQuestionsToolInputSchemaFlat = form(
  questionFieldFlatSchema,
);
export const askUserQuestionsToolInputSchema = form(questionFieldSchema);

const questionAnswerValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

export type QuestionAnswerValue = z.infer<typeof questionAnswerValueSchema>;

export const askUserQuestionsToolOutputSchema = z.object({
  completed: z.boolean(),
  cancelled: z.boolean(),
  cancelReason: z
    .enum(['user_cancelled', 'user_sent_message', 'agent_stopped'])
    .optional(),
  answers: z.record(z.string(), questionAnswerValueSchema),
  completedSteps: z.number(),
  notice: z.string().optional(),
});

export type AskUserQuestionsToolInput = z.infer<
  typeof askUserQuestionsToolInputSchema
>;
export type AskUserQuestionsToolOutput = z.infer<
  typeof askUserQuestionsToolOutputSchema
>;

export const askUserQuestionsToolSchema = {
  inputSchema: askUserQuestionsToolInputSchema,
  outputSchema: askUserQuestionsToolOutputSchema,
} as const;
