import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { z } from 'zod';
import { checkFileSize } from './file-utils';
import { FILE_SIZE_LIMITS } from './constants';

export const DESCRIPTION =
  "Use this tool to make an edit to an existing file.\n\nThis will be read by a less intelligent model, which will quickly apply the edit. You should make it clear what the edit is, while also minimizing the unchanged code you write.\nWhen writing the edit, you should specify each edit in sequence, with the special comment // ... existing code ... to represent unchanged code in between edited lines.\n\nFor example:\n\n// ... existing code ...\nFIRST_EDIT\n// ... existing code ...\nSECOND_EDIT\n// ... existing code ...\nTHIRD_EDIT\n// ... existing code ...\n\nYou should still bias towards repeating as few lines of the original file as possible to convey the change.\nBut, each edit should contain sufficient context of unchanged lines around the code you're editing to resolve ambiguity.\nDO NOT omit spans of pre-existing code (or comments) without using the // ... existing code ... comment to indicate its absence. If you omit the existing code comment, the model may inadvertently delete these lines.\nIf you plan on deleting a section, you must provide context before and after to delete it. If the initial code is ```code \\n Block 1 \\n Block 2 \\n Block 3 \\n code```, and you want to remove Block 2, you would output ```// ... existing code ... \\n Block 1 \\n  Block 3 \\n // ... existing code ...```.\nMake sure it is clear what the edit should be, and where it should be applied.\nMake edits to a file in a single edit_file call instead of multiple edit_file calls to the same file. The apply model can handle many distinct edits at once.";

export const editFileParamsSchema = z.object({
  target_file: z.string().describe('The target file to modify'),
  instructions: z
    .string()
    .describe(
      'A single sentence instruction describing what you are going to do for the sketched edit. This is used to assist the less intelligent model in applying the edit. Use the first person to describe what you are going to do. Use it to disambiguate uncertainty in the edit.',
    ),
  code_edit: z
    .string()
    .describe(
      "Specify ONLY the precise lines of code that you wish to edit. NEVER specify or write out unchanged code. Instead, represent all unchanged code using the comment of the language you're editing in - example: // ... existing code ...",
    ),
});

export type EditFileParams = z.infer<typeof editFileParamsSchema>;

const toolResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  error: z.string().optional(),
});

type ToolResult = z.infer<typeof toolResultSchema>;

/**
 * Edit File tool using Morph Fast Apply
 * - Uses AI to intelligently apply edits to existing files
 * - Supports multiple edits in a single operation using // ... existing code ... syntax
 * - More efficient than traditional search and replace for complex edits
 */
export async function editFileTool(
  params: EditFileParams,
  clientRuntime: ClientRuntime,
): Promise<ToolResult> {
  const { target_file, instructions, code_edit } = params;

  // Validate required parameters
  if (!target_file) {
    return {
      success: false,
      message: 'Missing required parameter: target_file',
      error: 'MISSING_TARGET_FILE',
    };
  }

  if (!instructions) {
    return {
      success: false,
      message: 'Missing required parameter: instructions',
      error: 'MISSING_INSTRUCTIONS',
    };
  }

  if (!code_edit) {
    return {
      success: false,
      message: 'Missing required parameter: code_edit',
      error: 'MISSING_CODE_EDIT',
    };
  }

  try {
    const absolutePath = clientRuntime.fileSystem.resolvePath(target_file);

    // Check if file exists
    const fileExists = await clientRuntime.fileSystem.fileExists(absolutePath);
    if (!fileExists) {
      return {
        success: false,
        message: `File does not exist: ${target_file}`,
        error: 'FILE_NOT_FOUND',
      };
    }

    // Check file size before reading
    const sizeCheck = await checkFileSize(
      clientRuntime,
      absolutePath,
      FILE_SIZE_LIMITS.EDIT_MAX_FILE_SIZE,
    );

    if (!sizeCheck.isWithinLimit) {
      return {
        success: false,
        message: sizeCheck.error || `File is too large to edit: ${target_file}`,
        error: 'FILE_TOO_LARGE',
      };
    }

    // Log file size if available
    if (sizeCheck.fileSize !== undefined) {
      console.log(
        `[editFileTool] Editing file ${target_file} (${sizeCheck.fileSize} bytes)`,
      );
    }

    // Read the current file content
    const readResult = await clientRuntime.fileSystem.readFile(absolutePath);
    if (!readResult.success || !readResult.content) {
      return {
        success: false,
        message: `Failed to read file: ${target_file}`,
        error: readResult.error || 'READ_ERROR',
      };
    }

    const initialCode = readResult.content;

    // Check for Morph API key
    const morphApiKey = process.env.MORPH_API_KEY;
    if (!morphApiKey) {
      return {
        success: false,
        message:
          'MORPH_API_KEY environment variable is not set. Please configure your Morph API key.',
        error: 'MISSING_API_KEY',
      };
    }

    // Call Morph Fast Apply API
    try {
      const response = await fetch(
        'https://api.morphllm.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${morphApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'morph-v3-large',
            messages: [
              {
                role: 'user',
                content: `<instruction>${instructions}</instruction>\n<code>${initialCode}</code>\n<update>${code_edit}</update>`,
              },
            ],
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          message: `Morph API request failed: ${response.status} ${response.statusText}`,
          error: `API_ERROR: ${errorText}`,
        };
      }

      const apiResponse = await response.json();
      const mergedCode = apiResponse.choices?.[0]?.message?.content;

      if (!mergedCode) {
        return {
          success: false,
          message: 'Morph API returned empty or invalid response',
          error: 'INVALID_API_RESPONSE',
        };
      }

      // Write the modified content back to the file
      const writeResult = await clientRuntime.fileSystem.writeFile(
        absolutePath,
        mergedCode,
      );

      if (!writeResult.success) {
        return {
          success: false,
          message: `Failed to write file: ${target_file}`,
          error: writeResult.error || 'WRITE_ERROR',
        };
      }

      return {
        success: true,
        message: `Successfully applied edit to ${target_file}`,
      };
    } catch (apiError) {
      return {
        success: false,
        message: `Morph API call failed: ${apiError instanceof Error ? apiError.message : 'Unknown API error'}`,
        error:
          apiError instanceof Error ? apiError.message : 'Unknown API error',
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Edit file failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
