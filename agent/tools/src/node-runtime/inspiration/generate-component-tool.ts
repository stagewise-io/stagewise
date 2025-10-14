import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, tool } from 'ai';
import { validateToolOutput } from '../..';
import { z } from 'zod';

export const DESCRIPTION =
  "Generate a component design for the current project based on the user's prompt.";

const examplePrompt = `Generate a glassy blue button with the primary color #2563eb, the secondary color #dbeafe, Inter font, a border radius of 12px and subtle hover animations`;
const exampleComponent = `export function GlassyButton() {
  return (
    <button
      type="button"
      className="relative flex h-10 flex-row items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 font-normal text-blue-50 text-sm shadow-black/5 shadow-lg transition-transform duration-300 ease-out after:pointer-events-none after:absolute after:inset-0 after:block after:size-full after:rounded-[inherit] after:shadow-[inset_2px_3px_1px_-3px_rgba(255,255,255,0.8),inset_2px_3px_3px_-2.5px_rgba(255,255,255,0.3),inset_-2px_-3px_1px_-3px_rgba(255,255,255,0.8),inset_-2px_-3px_3px_-2.5px_rgba(255,255,255,0.3),inset_0_0_1px_1px_rgba(50,50,50,0.15),inset_0_0_0_rgba(0,0,0,0),inset_0_4px_8px_4px_rgba(255,255,255,0.1),inset_0_-16px_32px_-24px_rgba(0,0,0,0.1)] after:transition-all after:duration-150 after:content-[''] hover:scale-[1.01] hover:shadow-xl active:scale-[0.98] active:shadow-md active:after:bg-black/2.5 enabled:active:after:shadow-[inset_2px_3px_1px_-3px_rgba(255,255,255,0.8),inset_2px_3px_3px_-2.5px_rgba(255,255,255,0.3),inset_-2px_-3px_1px_-3px_rgba(255,255,255,0.8),inset_-2px_-3px_3px_-2.5px_rgba(255,255,255,0.3),inset_0_0_1px_1px_rgba(50,50,50,0.15),inset_0_0_0_rgba(0,0,0,0),inset_0_2px_4px_3px_rgba(255,255,255,0.1),inset_0_-8px_16px_-16px_rgba(0,0,0,0.3)] enabled:hover:after:shadow-[inset_2px_3px_1px_-3px_rgba(255,255,255,0.8),inset_2px_3px_3px_-2.5px_rgba(255,255,255,0.3),inset_-2px_-3px_1px_-3px_rgba(255,255,255,0.8),inset_-2px_-3px_3px_-2.5px_rgba(255,255,255,0.3),inset_0_0_1px_1px_rgba(50,50,50,0.15),inset_0_0_0_rgba(0,0,0,0),inset_0_4px_16px_4px_rgba(255,255,255,0.15),inset_0_-16px_32px_-24px_rgba(0,0,0,0.1)] disabled:opacity-50 dark:bg-blue-800 dark:text-blue-100 dark:after:shadow-[inset_2px_3px_1px_-3px_rgba(255,255,255,0.6),inset_2px_3px_3px_-2.5px_rgba(255,255,255,0.2),inset_-2px_-3px_1px_-3px_rgba(255,255,255,0.6),inset_-2px_-3px_3px_-2.5px_rgba(255,255,255,0.2),inset_0_0_1px_1px_rgba(50,50,50,0.1),inset_0_0_0_rgba(0,0,0,0),inset_0_4px_8px_4px_rgba(255,255,255,0.05),inset_0_-16px_32px_-24px_rgba(0,0,0,0.05)] dark:enabled:active:after:shadow-[inset_2px_3px_1px_-3px_rgba(255,255,255,0.6),inset_2px_3px_3px_-2.5px_rgba(255,255,255,0.2),inset_-2px_-3px_1px_-3px_rgba(255,255,255,0.6),inset_-2px_-3px_3px_-2.5px_rgba(255,255,255,0.2),inset_0_0_1px_1px_rgba(50,50,50,0.1),inset_0_0_0_rgba(0,0,0,0),inset_0_2px_4px_3px_rgba(255,255,255,0.05),inset_0_-8px_16px_-16px_rgba(0,0,0,0.2)] dark:enabled:hover:after:shadow-[inset_2px_3px_1px_-3px_rgba(255,255,255,0.6),inset_2px_3px_3px_-2.5px_rgba(255,255,255,0.2),inset_-2px_-3px_1px_-3px_rgba(255,255,255,0.6),inset_-2px_-3px_3px_-2.5px_rgba(255,255,255,0.2),inset_0_0_1px_1px_rgba(50,50,50,0.1),inset_0_0_0_rgba(0,0,0,0),inset_0_4px_16px_4px_rgba(255,255,255,0.1),inset_0_-16px_32px_-24px_rgba(0,0,0,0.05)]"
    >
      Button
    </button>
  );
}
`;
const examplePrompt2 = `Generate a dark button with a shiny rotating border animation with the primary color #18181b, the secondary color #fafafa, Inter font and a border radius of 12px`;
const exampleComponent2 = `'use client';

import { useEffect, useState } from 'react';

export function RelaceButton() {
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    let animationFrameId: number;
    const animate = () => {
      setRotation((prev) => (prev + 2) % 360);
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <span
      className="relative inline-block rounded-xl p-[1px]"
      style={{
        background: \`conic-gradient(from \${rotation}deg, transparent 0deg, rgba(255, 255, 255, 0.1) 45deg, rgba(255, 255, 255, 0.6) 90deg, rgba(255, 255, 255, 0.1) 135deg, transparent 180deg, transparent 360deg)\`,
      }}
    >
      <button
        type="button"
        className="relative flex w-full items-center justify-center rounded-xl bg-[#202022] px-[1.125rem] py-2 font-medium text-sm text-white leading-[1.2] transition-all duration-300 hover:bg-[#303033]"
      >
        App
      </button>
    </span>
  );
}
`;
const examplePrompt3 = `Generate a 3D button with heavy press and hover animations with the primary color #FCFCFD, the secondary color #36395A, monospace font and a border radius of 8px`;
const exampleComponent3 = `export function ThreeDButton() {
  return (
    <button
      type="button"
      className="hover:-translate-y-0.5 relative inline-flex h-12 cursor-pointer touch-manipulation select-none list-none appearance-none items-center justify-center overflow-hidden whitespace-nowrap rounded border-0 bg-[#FCFCFD] px-4 text-left font-mono text-[#36395A] text-lg leading-none no-underline shadow-[0_2px_4px_rgba(45,35,66,0.4),0_7px_13px_-3px_rgba(45,35,66,0.3),inset_0_-3px_0_#D6D6E7] transition-[box-shadow,transform] duration-150 will-change-[box-shadow,transform] hover:shadow-[0_4px_8px_rgba(45,35,66,0.4),0_7px_13px_-3px_rgba(45,35,66,0.3),inset_0_-3px_0_#D6D6E7] focus:shadow-[inset_0_0_0_1.5px_#D6D6E7,0_2px_4px_rgba(45,35,66,0.4),0_7px_13px_-3px_rgba(45,35,66,0.3),inset_0_-3px_0_#D6D6E7] active:translate-y-0.5 active:shadow-[inset_0_3px_7px_#D6D6E7]"
    >
      Button
    </button>
  );
}`;

export const generateComponentParamsSchema = z.object({
  prompt: z
    .string()
    .describe(
      `The prompt that will be used to generate the component. Examples: ${examplePrompt}, ${examplePrompt2}, ${examplePrompt3}`,
    ),
});

export type GenerateComponentParams = z.infer<
  typeof generateComponentParamsSchema
>;

const systemPrompt = `You are an expert React component generator. Your task is to generate standalone, production-ready React components based on text descriptions.

## Tech Stack Requirements
- **React.js**: Use functional components with hooks when needed
- **Tailwind CSS**: Use ONLY basic Tailwind classes that work with default configuration
- **Framer Motion**: Use for animations when appropriate
- **Lucide React**: Use for icons when needed

## Critical Constraints
1. **No custom Tailwind configuration**: Your code must work with any standard React project using default Tailwind configuration. Never assume custom colors, spacing, or other config exists.
2. **Single file component**: Output exactly ONE component in ONE file
3. **No additional dependencies**: Only use react, tailwind, framer-motion, and lucide-react
4. **Named exports**: Always use named function exports (e.g., \`export function ComponentName()\`)
5. **Client components**: Add 'use client' directive at the top when using hooks, state, or interactive features
6. **Basic Tailwind only**: Use standard Tailwind utilities that exist in the default configuration

## Output Format
Output ONLY the raw component code. Do not include:
- Explanations or comments outside the code
- Multiple file suggestions
- Installation instructions
- Markdown code blocks or formatting
- Any text before or after the component code

## Examples

### Example 1: Glassy Button with Subtle Animations
**User Prompt**: ${examplePrompt}

**Expected Output**:
${exampleComponent}

### Example 2: Dark Button with Shiny Border Animation
**User Prompt**: ${examplePrompt2}

**Expected Output**:
${exampleComponent2}

### Example 3: 3D Button with Heavy Animations
**User Prompt**: ${examplePrompt3}

**Expected Output**:
${exampleComponent3}

## Component Guidelines
- **Visual Polish**: Focus on professional, polished designs with attention to detail
- **Animations**: Use smooth, performant animations that enhance UX
  - Subtle animations by default unless "heavy" or "dramatic" is specified
  - Use Framer Motion for complex animations
  - Use Tailwind transition utilities for simple hover/focus effects
- **Semantic HTML**: Use appropriate elements (button, input, label, etc.)
- **Accessibility**: Include proper ARIA attributes when needed
- **Responsive Design**: Make components responsive when applicable
- **Interactive States**: Include hover, active, focus, and disabled states as appropriate
- **Clean Code**: Keep the code maintainable and well-structured
- **Icons**: Import from lucide-react when icons are needed
- **State Management**: Use React hooks (useState, useEffect, etc.) when interactivity requires it
- **Naming**: Use descriptive, PascalCase names for component functions

## Important Reminders
- Match the style and complexity level indicated in the user's description
- If the description mentions specific colors, use standard Tailwind color utilities
- If animations are mentioned, make them prominent and noticeable
- If "subtle" is mentioned, keep effects minimal and refined
- Output ONLY the raw component code - no markdown code fences, no explanations, just the code

Remember: Your output should be valid TypeScript/JSX code that can be directly saved to a .tsx file and used immediately.`;

export type InspirationComponent = {
  id: string;
  createdAt: Date;
  reactCode: string;
  compiledCode: string;
};

/**
 * Generate component tool
 * - Generates a component for a given project
 * - Supports recursive listing with optional depth limits
 * - Supports filtering by file extension or pattern
 * - Returns detailed file information including type and size
 */
export async function generateComponentToolExecute(
  params: GenerateComponentParams,
  apiKey: string,
  onGenerated: (component: InspirationComponent) => void,
) {
  try {
    const litellm = createAnthropic({
      apiKey,
      baseURL: `${process.env.LLM_PROXY_URL || 'http://localhost:3002'}/v1`,
    });

    const result = await generateText({
      model: litellm('gemini-2.5-flash-lite'),
      temperature: 1.5,
      maxOutputTokens: 10000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: params.prompt },
      ],
    });
    onGenerated({
      id: crypto.randomUUID(),
      createdAt: new Date(),
      reactCode: result.text,
      compiledCode: result.text, // TODO: Compile the code
    });
    return {
      success: true,
      message: 'Component generated successfully',
      result: result.text,
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to generate component',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export const generateComponentTool = (
  apiKey: string,
  onGenerated: (component: InspirationComponent) => void,
) =>
  tool({
    name: 'generateComponentTool',
    description: DESCRIPTION,
    inputSchema: generateComponentParamsSchema,
    execute: async (args) => {
      return validateToolOutput(
        await generateComponentToolExecute(args, apiKey, onGenerated),
      );
    },
  });
