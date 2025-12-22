import { z } from 'zod';

export const baseReactSelectedElementInfoSchema = z.object({
  componentName: z
    .string()
    .min(1)
    .max(1024)
    .catch((input) => input.toString().slice(0, 1024)),
  serializedProps: z.record(z.string(), z.any()).transform((obj) => {
    // Truncate the props to a maximum of 20 entries. Then stringify everything and truncate to 100 characters if it's longer. Add "...[TRUNCATED]" if it's truncated.
    const truncatedProps = Object.entries(obj).slice(0, 20);
    const serializedProps = truncatedProps.map(([key, value]) => {
      let serializedValue: string;
      try {
        serializedValue = JSON.stringify(value);
        if (serializedValue.length > 100) {
          serializedValue = `${serializedValue.slice(0, 100)}...[TRUNCATED]`;
        }
      } catch {
        serializedValue = '[NOT SERIALIZABLE]';
      }
      return [key, serializedValue];
    });
    return Object.fromEntries(serializedProps);
  }),
  isRSC: z.boolean(),
});
export const reactSelectedElementInfoSchema = baseReactSelectedElementInfoSchema
  .extend({
    parent: baseReactSelectedElementInfoSchema.nullable().optional(),
  })
  .nullable();

export type ReactSelectedElementInfo = z.infer<
  typeof reactSelectedElementInfoSchema
>;
