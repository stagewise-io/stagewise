export const codingPlanIds = [
  'glm-coding-plan',
  'kimi-plan',
  'qwen-plan',
  'qwen-token-plan',
  'minimax-plan',
  'mimo-plan',
  'opencode-go',
] as const;

export type CodingPlanId = (typeof codingPlanIds)[number];
