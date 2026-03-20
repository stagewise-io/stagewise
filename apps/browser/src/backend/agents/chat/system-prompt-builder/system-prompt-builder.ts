import ApplicationInfo from '../../shared/prompts/system/application-info.md?raw';
import Identity from '../../shared/prompts/system/identity.md?raw';
import Behavior from '../../shared/prompts/system/behavior.md?raw';
import MessageStructure from '../../shared/prompts/system/message-structure.md?raw';
import SecurityAuthorityModel from '../../shared/prompts/system/security-authority-model.md?raw';
import { skillsUsageInstructions } from '../../shared/prompts/system/skills';

/** Chat agent system prompt structure (fully static):
 *
 * 1. Identity
 * 2. Behavior rules (communication + operating constraints)
 * 3. Application environment info (browser, stagewise files, etc.)
 * 4. Message structure explanation (custom formatting etc.)
 * 5. Security authority model (prevent prompt injection etc.)
 * 6. Skills usage instructions (how to use skills, not which are available)
 */

export function buildChatSystemPrompt(): string {
  return [
    `<identity>${Identity}</identity>`,
    `<behavior>${Behavior}</behavior>`,
    `<application-environment-info>${ApplicationInfo}</application-environment-info>`,
    `<message-structure>${MessageStructure}</message-structure>`,
    `<security-authority-model>${SecurityAuthorityModel}</security-authority-model>`,
    `<skills-usage>${skillsUsageInstructions}</skills-usage>`,
  ].join('\n');
}
