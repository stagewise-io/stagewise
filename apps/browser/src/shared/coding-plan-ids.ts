export const codingPlanIds = [
  'glm-coding-plan',
  'kimi-plan',
  'qwen-plan',
  'minimax-plan',
] as const;

export type CodingPlanId = (typeof codingPlanIds)[number];
