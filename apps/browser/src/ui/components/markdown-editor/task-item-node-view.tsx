import {
  NodeViewWrapper,
  NodeViewContent,
  type NodeViewProps,
} from '@tiptap/react';
import { Checkbox } from '@stagewise/stage-ui/components/checkbox';

export function TaskItemNodeView({
  node,
  updateAttributes,
  editor,
}: NodeViewProps) {
  const isEditable = editor.isEditable;

  return (
    <NodeViewWrapper
      as="li"
      className="flex items-start gap-1.5"
      data-type="taskItem"
      data-checked={node.attrs.checked ? 'true' : 'false'}
    >
      <Checkbox
        size="xs"
        checked={node.attrs.checked}
        onCheckedChange={
          isEditable
            ? (checked) => updateAttributes({ checked: checked === true })
            : undefined
        }
        disabled={!isEditable}
        className="mt-0.5 shrink-0"
        contentEditable={false}
      />
      <NodeViewContent as="div" className="flex-1" />
    </NodeViewWrapper>
  );
}
