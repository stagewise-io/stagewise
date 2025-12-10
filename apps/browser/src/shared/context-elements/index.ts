import type { ReactSelectedElementInfo } from './react';

export type { ReactSelectedElementInfo };

export type ContextElement = {
  id?: string;
  stagewiseId?: string;
  tagName: string;
  nodeType?: string; // Alias for tagName, kept for compatibility
  attributes: Record<string, string>;
  ownProperties: Record<string, unknown>;
  boundingClientRect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  xpath: string;
  textContent: string;
  parent: ContextElement | null;
  siblings: ContextElement[];
  children: ContextElement[];
  frameworkInfo?: {
    react: ReactSelectedElementInfo | null;
  };
  // Additional fields from SelectedElement
  frameId?: string;
  isMainFrame?: boolean;
  frameLocation?: string;
  frameTitle?: string | null;
  backendNodeId?: number;
  tabId?: string;
  codeMetadata?: Array<{
    relation: string;
    relativePath: string;
    startLine?: number;
    content?: string;
  }>;
};
