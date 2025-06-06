import type { ContextElementContext } from '@stagewise/toolbar';

interface AngularComponentInfo {
  name: string;
}

let angularWarningShown = false;

function checkAngularAndWarnOnce() {
  if (!(window as any).ng && !angularWarningShown) {
    console.warn(
      'Angular plugin: No Angular instance (window.ng) detected or Angular is not in development mode. Component detection features will not be available.',
    );
    angularWarningShown = true;
  }
}

/**
 * Attempts to find the hierarchy of Angular components (up to 3) that an HTMLElement belongs to.
 * It returns an array of objects, each containing the component's name.
 * The array is ordered from the closest component to the furthest.
 *
 * IMPORTANT: This function relies on Angular's `ng.getComponent()` debugging utility,
 * which is typically available in development mode. It may not work in production builds
 * or if Angular's debugging utilities are not exposed on the `window` object.
 *
 * @param element The HTMLElement to inspect.
 * @returns An array of AngularComponentInfo objects, or an empty array if no components are found.
 */
function getAngularComponentHierarchy(
  element: HTMLElement | null,
): AngularComponentInfo[] {
  if (!(window as any).ng || !(window as any).ng.getComponent) {
    return [];
  }

  const components: AngularComponentInfo[] = [];
  let currentElement: HTMLElement | null = element;
  const maxComponents = 3;

  while (currentElement && components.length < maxComponents) {
    try {
      const componentInstance = (window as any).ng.getComponent(currentElement);
      if (componentInstance) {
        let componentName = componentInstance.constructor.name;
        if (componentName.startsWith('_')) {
          componentName = componentName.substring(1);
        }

        if (componentName && componentName !== 'Object') {
          // Avoid adding generic 'Object' or already added names
          if (!components.some((c) => c.name === componentName)) {
            components.push({ name: componentName });
          }
        }
      }
    } catch (e) {
      // Element might not be an Angular component host, or other error
    }
    // Move to the parent element to check for parent components
    // Stop if we reach the body or if there's no parent
    if (
      currentElement.parentElement &&
      currentElement.parentElement !== document.body
    ) {
      currentElement = currentElement.parentElement;
    } else {
      break;
    }
  }

  return components;
}

export function getSelectedElementAnnotation(
  element: HTMLElement | null,
): ContextElementContext {
  checkAngularAndWarnOnce();
  if (!element) {
    return { annotation: null };
  }
  const hierarchy = getAngularComponentHierarchy(element);
  if (hierarchy.length > 0 && hierarchy[0]) {
    return {
      annotation: `${hierarchy[0].name}`,
    };
  }
  return { annotation: null };
}

export function getSelectedElementsPrompt(elements: HTMLElement[] | null) {
  checkAngularAndWarnOnce();
  if (!elements || elements.length === 0) {
    return null;
  }

  const selectedComponentHierarchies = elements.map((e) =>
    getAngularComponentHierarchy(e),
  );

  if (selectedComponentHierarchies.some((h) => h.length > 0)) {
    const content = `This is additional information on the elements that the user selected. Use this information to find the correct element in the codebase.

  ${selectedComponentHierarchies
    .map((h, index) => {
      const hierarchyString =
        h.length === 0
          ? 'No Angular component detected for this element'
          : `Angular component tree (from closest to farthest, ${h.length} closest element${h.length > 1 ? 's' : ''}): ${h.map((c) => `{name: ${c.name}}`).join(' child of ')}`;
      return `
<element index="${index + 1}">
  ${hierarchyString}
</element>
    `;
    })
    .join('')}
  `;

    console.log('content', content);

    return content;
  }

  return null;
}
