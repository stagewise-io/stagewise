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
  logoSvg?: string | null;
  group: string;
}
