export interface ComponentInfo {
  name: string;
  type: 'regular';
}

let hasWarnedNoVue = false;

/**
 * Attempts to find the hierarchy of Vue components (up to 3) that an HTMLElement belongs to.
 * It returns an array of objects, each containing the component's name.
 * The array is ordered from the closest component to the furthest.
 *
 * This function supports both Vue 3 (via __vueParentComponent) and Vue 1/2 (via __vue__/__vms__).
 * It relies on Vue's dev mode properties which are only available in development builds.
 *
 * @param element The HTMLElement to inspect.
 * @returns An array of ComponentInfo objects, or null if no components are found or the element is not Vue-managed.
 */
export function getVueComponentHierarchy(
  element: HTMLElement | null,
): ComponentInfo[] | null {
  if (!element) {
    return null;
  }

  const components: ComponentInfo[] = [];
  const maxComponents = 3;
  let currentElement: HTMLElement | null = element;

  while (currentElement && components.length < maxComponents) {
    // Strategy for Vue 3
    const parentComponent = (currentElement as any).__vueParentComponent;
    if (parentComponent?.type?.__name) {
      const componentName = parentComponent.type.__name;
      if (!components.some((c) => c.name === componentName)) {
        components.push({ name: componentName, type: 'regular' });
      }
    }

    // Strategy for Vue 1 & 2
    let vms: any[] = [];
    if (
      (currentElement as any).__vms__ &&
      Array.isArray((currentElement as any).__vms__)
    ) {
      vms = (currentElement as any).__vms__;
    } else if ((currentElement as any).__vue__) {
      vms = [(currentElement as any).__vue__];
    }

    for (const vm of vms) {
      if (!vm || !vm.$options) continue;
      let name =
        vm.$options.name ||
        vm.$options.__file ||
        vm.$options._componentTag ||
        'AnonymousComponent';
      // If __file is a path, extract the filename
      if (name && typeof name === 'string' && name.includes('/')) {
        name = (String(name).split('/').pop() || '').replace(/\.vue$/, '');
      }
      // Avoid duplicates
      if (!components.some((c) => c.name === name)) {
        components.push({ name, type: 'regular' });
      }
    }

    // Move up to the next parent element
    currentElement = currentElement.parentElement;
  }

  if (components.length === 0 && !hasWarnedNoVue) {
    // Only warn once
    // eslint-disable-next-line no-console
    console.warn(
      '[stagewise/vue] No Vue installation detected on the selected element. Make sure you are running in development mode and Vue is available.',
    );
    hasWarnedNoVue = true;
  }

  return components.length > 0 ? components : null;
}

/**
 * Formats the Vue component hierarchy information into a human-readable string.
 *
 * @param hierarchy An array of ComponentInfo objects, or null.
 * @returns A string describing the component hierarchy, or a message if no components are found.
 */
export function formatVueComponentHierarchy(
  hierarchy: ComponentInfo[] | null,
): string {
  if (!hierarchy || hierarchy.length === 0) {
    return 'No Vue components found for this element.';
  }

  const parts = hierarchy.map(
    (info) => `{name: ${info.name}, type: ${info.type}}`,
  );

  let description = `Vue component tree (from closest to farthest, ${hierarchy.length} closest element${hierarchy.length > 1 ? 's' : ''}): `;
  description += parts.join(' child of ');

  return description;
}

export function getSelectedElementAnnotation(element: HTMLElement) {
  console.log('getSelectedElementAnnotation', element);
  const hierarchy = getVueComponentHierarchy(element);
  console.log('hierarchy', hierarchy);
  if (hierarchy?.[0]) {
    return {
      annotation: `${hierarchy[0].name}`,
    };
  }
  return { annotation: null };
}

export function getSelectedElementsPrompt(elements: HTMLElement[]) {
  const selectedComponentHierarchies = elements.map(
    (e) => getVueComponentHierarchy(e) || [],
  );

  if (selectedComponentHierarchies.some((h) => h.length > 0)) {
    const content = `This is additional information on the elements that the user selected. Use this information to find the correct element in the codebase.

  ${selectedComponentHierarchies.map((h, index) => {
    return `
<element index="${index + 1}">
  ${h.length === 0 ? 'No Vue component as parent detected' : `Vue component tree (from closest to farthest, 3 closest elements): ${h.map((c) => `{name: ${c.name}, type: ${c.type}}`).join(' child of ')}`}
</element>
    `;
  })}
  `;

    return content;
  }

  return null;
}
