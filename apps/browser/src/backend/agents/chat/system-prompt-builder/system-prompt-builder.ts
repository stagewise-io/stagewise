import Intro from '../../shared/prompts/system/intro.md?raw';
import Soul from '../../shared/prompts/system/soul.md?raw';
import Environment from '../../shared/prompts/system/environment.md?raw';
import OutputStyle from '../../shared/prompts/system/output-style.md?raw';
import Authorities from '../../shared/prompts/system/authorities.md?raw';

/** Chat agent system prompt structure (fully static):
 *
 * 1. Soul (identity + behavior rules)
 * 2. Environment info (file system, browser, stagewise files, skills, etc.)
 * 3. Message structure explanation (custom formatting etc.)
 * 4. Security authority model (prevent prompt injection etc.)
 */

export function buildChatSystemPrompt(): string {
  return [
    Intro,
    `<soul>${Soul}</soul>`,
    `<environment>${Environment}</environment>`,
    `<output-style>${OutputStyle}</output-style>`,
    `<authorities>${Authorities}</authorities>`,
  ].join('\n');
}
