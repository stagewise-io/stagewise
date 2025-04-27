import type { RequestHandler } from 'express';
import { callCursorAgent } from '../../utils/call-cursor-agent';

export async function processPrompt(
  prompt: string,
): Promise<{ success: boolean; message: string }> {
  if (!prompt) {
    throw new Error('Prompt is required');
  }

  await callCursorAgent(prompt);
  return { success: true, message: 'Prompt processed successfully' };
}

export const handlePrompt: RequestHandler = async (req, res) => {
  if (!req.body) {
    res.status(400).json({
      success: false,
      error: 'Request body is required',
    });
    return;
  }

  const { prompt } = req.body;
  try {
    const result = await processPrompt(prompt);
    res.json(result);
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
};
