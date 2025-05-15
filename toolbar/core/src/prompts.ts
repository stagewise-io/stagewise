// SPDX-License-Identifier: AGPL-3.0-only
// Toolbar prompts
// Copyright (C) 2025 Goetze, Scharpff & Toews GbR

import type { ContextSnippet } from './plugin';

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
/**
 * Extracts React component names and source location from an HTMLElement.
 * @param element - The HTMLElement to extract React info from.
 * @returns An object containing component names and source location.
 */
export function getReactInfo(element: HTMLElement | null): {
  componentNames: string[];
  sourceLocation: string | null;
} {
  if (!element) {
    return { componentNames: [], sourceLocation: null };
  }
  try {
    // Find React Fiber key
    const fiberKey = Object.getOwnPropertyNames(element).find(
      (k) =>
        k.startsWith('__reactFiber$') ||
        k.startsWith('__reactInternalInstance$'),
    );

    if (!fiberKey) {
      return { componentNames: [], sourceLocation: null };
    }

    let fiber: any = (element as any)[fiberKey];
    const componentStack: string[] = [];

    // Walk up the Fiber tree and collect up to 10 component names
    while (fiber && componentStack.length < 10) {
      if (typeof fiber.type === 'function') {
        const name = fiber.type.displayName || fiber.type.name || 'Anonymous';
        if (!componentStack.includes(name)) {
          // Avoid duplicates
          componentStack.push(name);
        }
      }
      fiber = fiber.return;
    }

    // For source location, we could potentially get this from fiber._debugSource
    // but this is very internal and unstable, so leaving as null for now
    const sourceLocation = null;

    return {
      componentNames: componentStack,
      sourceLocation,
    };
  } catch (e) {
    return { componentNames: [], sourceLocation: null };
  }
}

/**
 * Extracts relevant attributes from an HTMLElement.
 * Filters out potentially noisy attributes like 'style' if computed styles are handled separately.
 * Prioritizes identifying attributes.
 */
function getElementAttributes(element: HTMLElement): { [key: string]: string } {
  const attrs: { [key: string]: string } = {};
  const priorityAttrs = [
    'id',
    'class',
    'name',
    'type',
    'href',
    'src',
    'alt',
    'for',
    'placeholder',
  ]; // Common identifying attributes
  const dataAttrs = [];

  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i];
    // Store data-* attributes separately for emphasis
    if (attr.name.startsWith('data-')) {
      dataAttrs.push({ name: attr.name, value: attr.value });
    }
    // Capture priority attributes or others, potentially excluding style if handled elsewhere
    else if (
      priorityAttrs.includes(attr.name.toLowerCase()) ||
      attr.name.toLowerCase() !== 'style'
    ) {
      // Include 'class' even though classList is preferred, as it's in the source HTML
      attrs[attr.name] = attr.value;
    }
  }
  // Add data attributes to the main dictionary, perhaps prefixed for clarity
  dataAttrs.forEach((da) => {
    attrs[da.name] = da.value;
  });
  return attrs;
}

/**
 * Generates a detailed context string for a single HTMLElement.
 */
function generateElementContext(element: HTMLElement, index: number): string {
  let context = `<element index="${index + 1}">\n`;
  context += `  <tag>${element.tagName.toLowerCase()}</tag>\n`;

  const id = element.id;
  if (id) {
    context += `  <id>${id}</id>\n`;
  }

  const classes = Array.from(element.classList).join(', ');
  if (classes) {
    context += `  <classes>${classes}</classes>\n`;
  }

  const attributes = getElementAttributes(element);
  if (Object.keys(attributes).length > 0) {
    context += `  <attributes>\n`;
    for (const [key, value] of Object.entries(attributes)) {
      if (key.toLowerCase() !== 'class' || !classes) {
        context += `    <${key}>${value}</${key}>\n`;
      }
    }
    context += `  </attributes>\n`;
  }

  const text = element.innerText?.trim();
  if (text) {
    const maxLength = 100;
    context += `  <text>${text.length > maxLength ? `${text.substring(0, maxLength)}...` : text}</text>\n`;
  }

  context += `  <structural_context>\n`;
  if (element.parentElement) {
    const parent = element.parentElement;
    context += `    <parent>\n`;
    context += `      <tag>${parent.tagName.toLowerCase()}</tag>\n`;
    if (parent.id) {
      context += `      <id>${parent.id}</id>\n`;
    }
    const parentClasses = Array.from(parent.classList).join(', ');
    if (parentClasses) {
      context += `      <classes>${parentClasses}</classes>\n`;
    }
    context += `    </parent>\n`;
  } else {
    context += `    <parent>No parent element found (likely root or disconnected)</parent>\n`;
  }
  context += `  </structural_context>\n`;

  try {
    const styles = window.getComputedStyle(element);
    const relevantStyles = {
      color: styles.color,
      backgroundColor: styles.backgroundColor,
      fontSize: styles.fontSize,
      fontWeight: styles.fontWeight,
      display: styles.display,
    };
    context += `  <styles>\n`;
    for (const [key, value] of Object.entries(relevantStyles)) {
      context += `    <${key}>${value}</${key}>\n`;
    }
    context += `  </styles>\n`;
  } catch (e) {
    context += `  <styles>Could not retrieve computed styles</styles>\n`;
  }

  context += `</element>\n`;
  return context;
}

export interface PluginContextSnippets {
  pluginName: string;
  contextSnippets: ContextSnippet[];
}
[];

/**
 * Creates a comprehensive prompt for a Coding Agent LLM.
 *
 * @param selectedElements - An array of HTMLElements the user interacted with.
 * @param userPrompt - The user's natural language instruction.
 * @param url - The URL of the page where the interaction occurred.
 * @param contextSnippets - An array of context snippets from a list of plugins.
 * @returns A formatted string prompt for the LLM.
 */
export function createPrompt(
  selectedElements: HTMLElement[],
  userPrompt: string,
  url: string,
  contextSnippets: PluginContextSnippets[],
): string {
  const pluginContext = contextSnippets
    .map((snippet) =>
      `
      <plugin_contexts>
<${snippet.pluginName}>
${snippet.contextSnippets.map((snippet) => `    <${snippet.promptContextName}>${snippet.content}</${snippet.promptContextName}>`).join('\n')}
</${snippet.pluginName}>
</plugin_contexts>
`.trim(),
    )
    .join('\n');

  if (!selectedElements || selectedElements.length === 0) {
    return `
    <request>
      <user_goal>${userPrompt}</user_goal>
      <url>${url}</url>
  <context>No specific element was selected on the page. Please analyze the page code in general or ask for clarification.</context>
  ${pluginContext}
</request>`.trim();
  }

  let detailedContext = '';
  selectedElements.forEach((element, index) => {
    detailedContext += generateElementContext(element, index);
  });

  return `
<request>
  <user_goal>${userPrompt}</user_goal>
  <url>${url}</url>
  <selected_elements>
    ${detailedContext.trim()}
  </selected_elements>
  ${pluginContext}
</request>`.trim();
}
