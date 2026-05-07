# Feature Request: Ability to hide the left sidebar (chat history)

It would be great to have a way to **fully hide the left sidebar** containing the agents/chat history list.

Currently, even when collapsed to its minimum size (12%), it occupies a significant amount of horizontal space. This is especially noticeable on smaller screens or when the user wants to focus entirely on the browser content and chat panel.

## Proposed solution

1. Add a collapse button in the sidebar (e.g., a chevron icon at the top-right or bottom of the sidebar).
2. When collapsed, the sidebar should be completely hidden (0 width).
3. Show a toggle button (e.g., in the top-left corner of the content area) to re-open the sidebar.
4. Use the existing `collapsedSize` prop from `react-resizable-panels` which is already available in the codebase but not currently wired up for the sidebar.

## Notes

- The sidebar (`apps/browser/src/ui/screens/main/sidebar/index.tsx`) already has a `panelRef` of type `ImperativePanelHandle` declared but unused, and `react-resizable-panels` supports `collapsedSize`, `onCollapse`, and `onExpand` props.
- There's also an `AgentPreviewBadge` component (`apps/browser/src/ui/screens/main/content/_components/agent-preview-badge.tsx`) with a "Toggle chat panel" button that is currently orphaned (not imported anywhere).
- The `react-resizable-panels` library's `ImperativePanelHandle.collapse()` and `.expand()` methods can be used for programmatic control.

So most of the necessary infrastructure is already in place — it mainly needs to be connected.
