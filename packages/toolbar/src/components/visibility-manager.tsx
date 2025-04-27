import { VNode } from "preact";

export function VisibilityManager({ children }: { children?: VNode }) {
  console.log("VisibilityManager rendered!");
  return children;
}
