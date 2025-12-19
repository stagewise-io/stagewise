import { z } from 'zod';
import { rethrowCappedToolOutputError } from '../utils/error';
import { capToolOutput } from '../utils/tool-output-capper';
import { TOOL_OUTPUT_LIMITS } from '../constants';

export const DESCRIPTION = `Execute JavaScript in the browser console of the currently active tab. Works on ANY website (external sites or localhost).

Use cases:
1. COPY STYLES from external websites - Extract computed styles, then implement in user's codebase
2. DEBUG STYLING ISSUES on user's app - Inspect why elements look wrong

When copying styles, be INCREDIBLY THOROUGH. Extract ALL of:
- Base computed styles (colors, typography, spacing, borders, shadows, layout)
- Pseudo-elements (::before, ::after) via getComputedStyle(el, '::before')
- Pseudo-class states (:hover, :active, :focus) - check CSS rules in stylesheets
- Transitions & animations (timing, easing, @keyframes)
- Advanced effects (backdrop-filter, gradients, clip-path)

Script patterns:
- getComputedStyle(el) for all CSS properties
- getComputedStyle(el, '::before') for pseudo-elements
- document.styleSheets to find CSS rules and @keyframes
- Return results as JSON.stringify({...}) for structured data

Parameters:
- script (string, REQUIRED): JavaScript code to execute. Must return serializable value.
`;

export type BrowserRuntime = {
  executeScript: (script: string) => Promise<string>;
};

export const executeConsoleScriptParamsSchema = z.object({
  script: z.string(),
});

export type ExecuteConsoleScriptParams = z.infer<
  typeof executeConsoleScriptParamsSchema
>;

export const executeConsoleScriptTool = (runtime: BrowserRuntime) => {
  return {
    name: 'executeConsoleScript',
    description: DESCRIPTION,
    inputSchema: executeConsoleScriptParamsSchema,
    execute: (params: ExecuteConsoleScriptParams) =>
      executeConsoleScriptToolExecute(params, runtime),
  };
};

async function executeConsoleScriptToolExecute(
  params: ExecuteConsoleScriptParams,
  runtime: BrowserRuntime,
) {
  try {
    const result = await runtime.executeScript(params.script);
    return {
      message: 'Successfully executed console script',
      result: capToolOutput(result, {
        maxBytes:
          TOOL_OUTPUT_LIMITS.EXECUTE_CONSOLE_SCRIPT.MAX_TOTAL_OUTPUT_SIZE,
      }),
    };
  } catch (error) {
    rethrowCappedToolOutputError(error);
  }
}
