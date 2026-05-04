import type { NodeViewProps } from '@tiptap/react';

type ViewOnlyProps = {
  viewOnly: true;
  selected: boolean;
  node: { attrs: { readonly [attr: string]: any } };
};

export type InlineNodeViewProps = NodeViewProps | ViewOnlyProps;

/**
 * Base attributes shared by all inline node types (attachments, mentions, etc.).
 */
export interface BaseNodeAttrs {
  id: string;
  label: string;
}
