import type { BaseNodeAttrs } from '../shared/types';

export interface SlashAttrs extends BaseNodeAttrs {
  /** The command ID, e.g. 'plan' */
  id: string;
  /** Display label, e.g. '/plan' */
  label: string;
}

export interface SlashItem {
  id: string;
  label: string;
  description?: string;
  group: string;
  /** When set, this is a synthetic "Show N more" trigger, not a real command. */
  expandGroup?: string;
  /** The truncated items hidden behind this "Show more" row. */
  hiddenItems?: SlashItem[];
}
