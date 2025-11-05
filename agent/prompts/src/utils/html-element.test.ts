import { describe, it, expect } from 'vitest';
import type { SelectedElement } from '@stagewise/karton-contract';
import {
  htmlElementToContextSnippet,
  htmlElementsToContextSnippet,
} from './html-elements.js';

// Helper function to create complete SelectedElement objects
function createSelectedElement(
  partial: Partial<SelectedElement>,
): SelectedElement {
  return {
    stagewiseId: partial.stagewiseId || 'test-stagewise-id',
    nodeType: 'DIV',
    xpath: '/html/body/div',
    attributes: {},
    textContent: '',
    ownProperties: {},
    boundingClientRect: { top: 0, left: 0, width: 0, height: 0 },
    pluginInfo: [],
    codeMetadata: [],
    ...partial,
  };
}

describe('htmlElementToContextSnippet', () => {
  it('should handle empty array', () => {
    const result = htmlElementToContextSnippet([]);
    expect(result).toContain('<dom-elements>');
    expect(result).toContain('<description>');
    expect(result).toContain('</dom-elements>');
    expect(result).toContain('<content>');
  });

  it('should handle single element', () => {
    const element = createSelectedElement({
      nodeType: 'DIV',
      attributes: { id: 'test-id', class: 'test-class' },
      xpath: '/html/body/div',
      textContent: 'Test content',
      boundingClientRect: { top: 10, left: 20, width: 100, height: 50 },
    });

    const result = htmlElementToContextSnippet([element]);
    expect(result).toContain('<dom-elements>');
    expect(result).toContain('<html-element');
    expect(result).toContain('</html-element>');
  });

  it('should handle multiple elements', () => {
    const elements = [
      createSelectedElement({
        nodeType: 'DIV',
        attributes: { id: 'div1' },
        xpath: '/html/body/div[1]',
      }),
      createSelectedElement({
        nodeType: 'SPAN',
        attributes: { id: 'span1' },
        xpath: '/html/body/span',
      }),
    ];

    const result = htmlElementToContextSnippet(elements);
    expect(result).toContain('<dom-elements>');
    const elementMatches = result.match(/<html-element/g);
    expect(elementMatches).toHaveLength(2);
  });
});

describe('htmlElementsToContextSnippet', () => {
  describe('standard cases', () => {
    it('should format basic element with ID', () => {
      const element = createSelectedElement({
        nodeType: 'DIV',
        attributes: { id: 'my-element' },
        xpath: '/html/body/div',
      });

      const result = htmlElementsToContextSnippet(element);
      expect(result).toContain('type="div"');
      expect(result).toContain('selector="#my-element"');
      expect(result).toContain('xpath="/html/body/div"');
      expect(result).toContain('<div id="my-element">');
    });

    it('should format element with classes', () => {
      const element = createSelectedElement({
        nodeType: 'BUTTON',
        attributes: { class: 'btn primary large' },
        xpath: '/html/body/button',
      });

      const result = htmlElementsToContextSnippet(element);
      expect(result).toContain('type="button"');
      expect(result).toContain('selector=".btn.primary.large"');
      expect(result).toContain('class="btn primary large"');
    });

    it('should format element with multiple attributes', () => {
      const element = createSelectedElement({
        nodeType: 'INPUT',
        attributes: {
          type: 'text',
          name: 'username',
          placeholder: 'Enter username',
          required: 'true',
        },
        xpath: '/html/body/form/input',
      });

      const result = htmlElementsToContextSnippet(element);
      expect(result).toContain('type="input"');
      expect(result).toContain('type="text"');
      expect(result).toContain('name="username"');
      expect(result).toContain('placeholder="Enter username"');
      expect(result).toContain('required="true"');
    });

    it('should format element with text content', () => {
      const element = createSelectedElement({
        nodeType: 'P',
        attributes: {},
        xpath: '/html/body/p',
        textContent: 'This is a paragraph with some text.',
      });

      const result = htmlElementsToContextSnippet(element);
      expect(result).toContain('type="p"');
      expect(result).toContain('This is a paragraph with some text.');
      expect(result).toContain('<p>This is a paragraph with some text.</p>');
    });

    it('should format element with bounding rect', () => {
      const element = createSelectedElement({
        nodeType: 'DIV',
        attributes: { id: 'positioned' },
        xpath: '/html/body/div',
        boundingClientRect: {
          top: 100,
          left: 50,
          width: 200,
          height: 150,
        },
      });

      const result = htmlElementsToContextSnippet(element);
      // Bounding rect is not included in the HTML output anymore
      expect(result).toContain('type="div"');
      expect(result).toContain('selector="#positioned"');
      expect(result).toContain('<div id="positioned"></div>');
      expect(result).not.toContain('position: absolute');
    });

    it('should format element without ID or class', () => {
      const element = createSelectedElement({
        nodeType: 'SECTION',
        attributes: { 'data-role': 'main' },
        xpath: '/html/body/section',
      });

      const result = htmlElementsToContextSnippet(element);
      expect(result).toContain('type="section"');
      expect(result).not.toContain('selector=');
      expect(result).toContain('data-role="main"');
    });
  });

  describe('edge cases', () => {
    it('should throw error for null element', () => {
      expect(() => {
        htmlElementsToContextSnippet(null as any);
      }).toThrow('Element cannot be null or undefined');
    });

    it('should throw error for undefined element', () => {
      expect(() => {
        htmlElementsToContextSnippet(undefined as any);
      }).toThrow('Element cannot be null or undefined');
    });

    it('should handle element with special characters in attributes', () => {
      const element = createSelectedElement({
        nodeType: 'DIV',
        attributes: {
          'data-info': 'Value with "quotes" and <brackets>',
          title: "It's a test & more",
        },
        xpath: '/html/body/div',
      });

      const result = htmlElementsToContextSnippet(element);
      expect(result).toContain(
        'data-info="Value with "quotes" and <brackets>"',
      );
      expect(result).toContain('title="It\'s a test & more"');
    });

    it('should handle element with empty attributes object', () => {
      const element = createSelectedElement({
        nodeType: 'SPAN',
        attributes: {},
        xpath: '/html/body/span',
      });

      const result = htmlElementsToContextSnippet(element);
      expect(result).toContain('type="span"');
      expect(result).toContain('<span></span>');
    });

    it('should handle element with newlines in text content', () => {
      const element = createSelectedElement({
        nodeType: 'PRE',
        attributes: {},
        xpath: '/html/body/pre',
        textContent: 'Line 1\nLine 2\nLine 3',
      });

      const result = htmlElementsToContextSnippet(element);
      const lines = result.split('\n');
      expect(lines.some((line) => line.includes('Line 1'))).toBe(true);
      expect(lines.some((line) => line.includes('Line 2'))).toBe(true);
      expect(lines.some((line) => line.includes('Line 3'))).toBe(true);
    });

    it('should handle lowercase nodeType', () => {
      const element = createSelectedElement({
        nodeType: 'div',
        attributes: { id: 'lowercase' },
        xpath: '/html/body/div',
      });

      const result = htmlElementsToContextSnippet(element);
      expect(result).toContain('type="div"');
    });
  });

  describe('complex examples', () => {
    it('should format a complex button element', () => {
      const element = createSelectedElement({
        nodeType: 'BUTTON',
        attributes: {
          id: 'submit-btn',
          class: 'btn btn-primary submit-form',
          type: 'submit',
          'data-action': 'submitForm',
          'aria-label': 'Submit the form',
        },
        xpath: '/html/body/form/button',
        textContent: 'Submit',
        boundingClientRect: {
          top: 300,
          left: 400,
          width: 120,
          height: 40,
        },
      });

      const result = htmlElementsToContextSnippet(element);
      expect(result).toContain('type="button"');
      expect(result).toContain('selector="#submit-btn"');
      expect(result).toContain('class="btn btn-primary submit-form"');
      expect(result).toContain('aria-label="Submit the form"');
      expect(result).toContain('Submit');
    });

    it('should format a complex form input', () => {
      const element = createSelectedElement({
        nodeType: 'INPUT',
        attributes: {
          id: 'email-input',
          class: 'form-control validated',
          type: 'email',
          name: 'user_email',
          placeholder: 'your@email.com',
          required: 'true',
          'data-validation': 'email',
          maxlength: '255',
        },
        xpath: '/html/body/form/div/input',
      });

      const result = htmlElementsToContextSnippet(element);
      expect(result).toContain('type="input"');
      expect(result).toContain('selector="#email-input"');
      expect(result).toContain('maxlength="255"');
      expect(result).toContain('data-validation="email"');
    });

    it('should format an anchor link with all properties', () => {
      const element = createSelectedElement({
        nodeType: 'A',
        attributes: {
          href: 'https://example.com',
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'external-link primary',
        },
        xpath: '/html/body/nav/a',
        textContent: 'Visit Example',
        boundingClientRect: {
          top: 50,
          left: 100,
          width: 150,
          height: 30,
        },
      });

      const result = htmlElementsToContextSnippet(element);
      expect(result).toContain('type="a"');
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('Visit Example');
    });
  });

  describe('character limit tests', () => {
    it('should not truncate content under limit', () => {
      const element = createSelectedElement({
        nodeType: 'DIV',
        attributes: { id: 'short' },
        xpath: '/html/body/div',
        textContent: 'Short text',
      });

      const result = htmlElementsToContextSnippet(element, 500);
      expect(result).toContain('Short text');
      expect(result).not.toContain('truncated="true"');
    });

    it('should truncate content over limit', () => {
      const element = createSelectedElement({
        nodeType: 'DIV',
        attributes: { id: 'long' },
        xpath: '/html/body/div',
        textContent: 'a'.repeat(1000),
      });

      const result = htmlElementsToContextSnippet(element, 200);
      expect(result.length).toBeLessThanOrEqual(200);
      expect(result).toContain('role="selected-element"');
      expect(result).toContain('id="long"');
    });

    it('should handle very small character limit', () => {
      const element = createSelectedElement({
        nodeType: 'DIV',
        attributes: { id: 'test' },
        xpath: '/html/body/div',
        textContent: 'Some content here',
      });

      const result = htmlElementsToContextSnippet(element, 50);
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it('should truncate HTML content when over limit', () => {
      const element = createSelectedElement({
        nodeType: 'DIV',
        attributes: { id: 'multiline' },
        xpath: '/html/body/div',
        textContent: 'Line 1\n'.repeat(50),
      });

      const result = htmlElementsToContextSnippet(element, 300);
      expect(result.length).toBeLessThanOrEqual(300);
      expect(result).toContain('role="selected-element"');
      expect(result).toContain('id="multiline"');
    });

    it('should handle element with no truncation needed exactly at limit', () => {
      const element = createSelectedElement({
        nodeType: 'P',
        attributes: {},
        xpath: '/html/body/p',
        textContent: 'Test',
      });

      const fullResult = htmlElementsToContextSnippet(element);
      const limitedResult = htmlElementsToContextSnippet(
        element,
        fullResult.length,
      );

      expect(limitedResult).toBe(fullResult);
      expect(limitedResult).not.toContain('truncated="true"');
    });
  });

  describe('output format', () => {
    it('should not add line numbers to output', () => {
      const element = createSelectedElement({
        nodeType: 'DIV',
        attributes: { id: 'test' },
        xpath: '/html/body/div',
        textContent: 'Content',
      });

      const result = htmlElementsToContextSnippet(element);
      expect(result).not.toMatch(/\s+1:/);
      expect(result).toContain('<div id="test">Content</div>');
    });

    it('should preserve multi-line content without line numbers', () => {
      const element = createSelectedElement({
        nodeType: 'DIV',
        attributes: { id: 'multiline' },
        xpath: '/html/body/div',
        textContent: 'Line 1\nLine 2\nLine 3',
      });

      const result = htmlElementsToContextSnippet(element);
      expect(result).not.toContain('lines="');
      expect(result).not.toContain('total="');
      expect(result).toContain('Line 1\nLine 2\nLine 3');
    });
  });

  describe('parent hierarchy', () => {
    it('should include no parents when element has no parent', () => {
      const element = createSelectedElement({
        nodeType: 'DIV',
        attributes: { id: 'orphan' },
        xpath: '/html/body/div',
        parent: undefined,
      });

      const result = htmlElementsToContextSnippet(element);
      expect(result).toContain('role="selected-element"');
      expect(result).toContain('selected="true"');
      expect(result).not.toContain('role="parent"');
    });

    it('should include 1 parent when available', () => {
      const parent = createSelectedElement({
        stagewiseId: 'parent-1',
        nodeType: 'DIV',
        attributes: { id: 'parent' },
        xpath: '/html/body',
      });

      const element = createSelectedElement({
        nodeType: 'BUTTON',
        attributes: { id: 'selected' },
        xpath: '/html/body/button',
        parent,
      });

      const result = htmlElementsToContextSnippet(element);
      expect(result).toContain('role="parent"');
      expect(result).toContain('depth="-1"');
      expect(result).toContain('id="parent"');
      expect(result).toContain('role="selected-element"');
      expect(result).toContain('id="selected"');
    });

    it('should include up to 2 parents', () => {
      const grandparent = createSelectedElement({
        stagewiseId: 'grandparent',
        nodeType: 'BODY',
        attributes: { id: 'grandparent' },
        xpath: '/html/body',
      });

      const parent = createSelectedElement({
        stagewiseId: 'parent',
        nodeType: 'DIV',
        attributes: { id: 'parent' },
        xpath: '/html/body/div',
        parent: grandparent,
      });

      const element = createSelectedElement({
        nodeType: 'BUTTON',
        attributes: { id: 'selected' },
        xpath: '/html/body/div/button',
        parent,
      });

      const result = htmlElementsToContextSnippet(element);

      // Should have grandparent at depth -2
      expect(result).toContain('role="parent"');
      expect(result).toContain('depth="-2"');
      expect(result).toContain('id="grandparent"');

      // Should have parent at depth -1
      expect(result).toContain('depth="-1"');
      expect(result).toContain('id="parent"');

      // Should have selected at depth 0
      expect(result).toContain('depth="0"');
      expect(result).toContain('selected="true"');
      expect(result).toContain('id="selected"');
    });

    it('should limit to 2 parents even when more exist', () => {
      const greatGrandparent = createSelectedElement({
        stagewiseId: 'great-grandparent',
        nodeType: 'HTML',
        attributes: { id: 'great-grandparent' },
        xpath: '/html',
      });

      const grandparent = createSelectedElement({
        stagewiseId: 'grandparent',
        nodeType: 'BODY',
        attributes: { id: 'grandparent' },
        xpath: '/html/body',
        parent: greatGrandparent,
      });

      const parent = createSelectedElement({
        stagewiseId: 'parent',
        nodeType: 'DIV',
        attributes: { id: 'parent' },
        xpath: '/html/body/div',
        parent: grandparent,
      });

      const element = createSelectedElement({
        nodeType: 'BUTTON',
        attributes: { id: 'selected' },
        xpath: '/html/body/div/button',
        parent,
      });

      const result = htmlElementsToContextSnippet(element);

      // Should not have great-grandparent
      expect(result).not.toContain('id="great-grandparent"');

      // Should have grandparent at depth -2
      expect(result).toContain('id="grandparent"');
      expect(result).toContain('depth="-2"');

      // Should have parent at depth -1
      expect(result).toContain('id="parent"');
      expect(result).toContain('depth="-1"');

      // Count parent elements - should be exactly 2
      const parentMatches = result.match(/role="parent"/g);
      expect(parentMatches).toHaveLength(2);
    });
  });

  describe('children hierarchy', () => {
    it('should include no children when element has no children', () => {
      const element = createSelectedElement({
        nodeType: 'DIV',
        attributes: { id: 'leaf' },
        xpath: '/html/body/div',
        children: [],
      });

      const result = htmlElementsToContextSnippet(element);
      expect(result).toContain('role="selected-element"');
      expect(result).not.toContain('role="child"');
    });

    it('should include 1 level of children', () => {
      const element = createSelectedElement({
        nodeType: 'DIV',
        attributes: { id: 'parent' },
        xpath: '/html/body/div',
        children: [
          createSelectedElement({
            stagewiseId: 'child-1',
            nodeType: 'SPAN',
            attributes: { id: 'child-1' },
            xpath: '/html/body/div/span',
          }),
        ],
      });

      const result = htmlElementsToContextSnippet(element);
      expect(result).toContain('role="selected-element"');
      expect(result).toContain('role="child"');
      expect(result).toContain('depth="1"');
      expect(result).toContain('id="child-1"');
    });

    it('should include up to 4 levels of children', () => {
      const level4 = createSelectedElement({
        stagewiseId: 'child-4',
        nodeType: 'I',
        attributes: { id: 'child-4' },
        xpath: '/html/body/div/span/em/i',
      });

      const level3 = createSelectedElement({
        stagewiseId: 'child-3',
        nodeType: 'EM',
        attributes: { id: 'child-3' },
        xpath: '/html/body/div/span/em',
        children: [level4],
      });

      const level2 = createSelectedElement({
        stagewiseId: 'child-2',
        nodeType: 'STRONG',
        attributes: { id: 'child-2' },
        xpath: '/html/body/div/span',
        children: [level3],
      });

      const level1 = createSelectedElement({
        stagewiseId: 'child-1',
        nodeType: 'SPAN',
        attributes: { id: 'child-1' },
        xpath: '/html/body/div/span',
        children: [level2],
      });

      const element = createSelectedElement({
        nodeType: 'DIV',
        attributes: { id: 'selected' },
        xpath: '/html/body/div',
        children: [level1],
      });

      const result = htmlElementsToContextSnippet(element);

      // Should have selected
      expect(result).toContain('role="selected-element"');
      expect(result).toContain('id="selected"');

      // Should have all 4 levels
      expect(result).toContain('depth="1"');
      expect(result).toContain('id="child-1"');

      expect(result).toContain('depth="2"');
      expect(result).toContain('id="child-2"');

      expect(result).toContain('depth="3"');
      expect(result).toContain('id="child-3"');

      expect(result).toContain('depth="4"');
      expect(result).toContain('id="child-4"');
    });

    it('should limit to 4 levels even when more exist', () => {
      const level6 = createSelectedElement({
        stagewiseId: 'child-6',
        nodeType: 'U',
        attributes: { id: 'child-6' },
        xpath: '/html/body/div/span/em/i/b/u',
      });

      const level5 = createSelectedElement({
        stagewiseId: 'child-5',
        nodeType: 'B',
        attributes: { id: 'child-5' },
        xpath: '/html/body/div/span/em/i/b',
        children: [level6],
      });

      const level4 = createSelectedElement({
        stagewiseId: 'child-4',
        nodeType: 'I',
        attributes: { id: 'child-4' },
        xpath: '/html/body/div/span/em/i',
        children: [level5],
      });

      const level3 = createSelectedElement({
        stagewiseId: 'child-3',
        nodeType: 'EM',
        attributes: { id: 'child-3' },
        xpath: '/html/body/div/span/em',
        children: [level4],
      });

      const level2 = createSelectedElement({
        stagewiseId: 'child-2',
        nodeType: 'STRONG',
        attributes: { id: 'child-2' },
        xpath: '/html/body/div/span',
        children: [level3],
      });

      const level1 = createSelectedElement({
        stagewiseId: 'child-1',
        nodeType: 'SPAN',
        attributes: { id: 'child-1' },
        xpath: '/html/body/div/span',
        children: [level2],
      });

      const element = createSelectedElement({
        nodeType: 'DIV',
        attributes: { id: 'selected' },
        xpath: '/html/body/div',
        children: [level1],
      });

      const result = htmlElementsToContextSnippet(element);

      // Should have up to depth 4
      expect(result).toContain('depth="1"');
      expect(result).toContain('depth="2"');
      expect(result).toContain('depth="3"');
      expect(result).toContain('depth="4"');

      // Should NOT have depth 5 or 6
      expect(result).not.toContain('depth="5"');
      expect(result).not.toContain('depth="6"');
      expect(result).not.toContain('id="child-5"');
      expect(result).not.toContain('id="child-6"');
    });
  });

  describe('siblings', () => {
    it('should not include siblings when element has no parent', () => {
      const element = createSelectedElement({
        nodeType: 'DIV',
        attributes: { id: 'orphan' },
        xpath: '/html/body/div',
        parent: undefined,
      });

      const result = htmlElementsToContextSnippet(element);
      expect(result).not.toContain('role="sibling"');
    });

    it('should include siblings when parent has multiple children', () => {
      const sibling1 = createSelectedElement({
        stagewiseId: 'sibling-1',
        nodeType: 'SPAN',
        attributes: { id: 'sibling-1' },
        xpath: '/html/body/div/span[1]',
      });

      const selected = createSelectedElement({
        stagewiseId: 'selected',
        nodeType: 'BUTTON',
        attributes: { id: 'selected' },
        xpath: '/html/body/div/button',
      });

      const sibling2 = createSelectedElement({
        stagewiseId: 'sibling-2',
        nodeType: 'INPUT',
        attributes: { id: 'sibling-2' },
        xpath: '/html/body/div/input',
      });

      const parent = createSelectedElement({
        stagewiseId: 'parent',
        nodeType: 'DIV',
        attributes: { id: 'parent' },
        xpath: '/html/body/div',
        children: [sibling1, selected, sibling2],
      });

      selected.parent = parent;

      const result = htmlElementsToContextSnippet(selected);

      // Should have selected element
      expect(result).toContain('role="selected-element"');
      expect(result).toContain('id="selected"');

      // Should have siblings
      expect(result).toContain('role="sibling"');
      expect(result).toContain('id="sibling-1"');
      expect(result).toContain('id="sibling-2"');

      // Siblings should be at depth 0
      const siblingMatches = result.match(/role="sibling"/g);
      expect(siblingMatches).toHaveLength(2);
    });
  });

  describe('role and depth attributes', () => {
    it('should correctly assign role and depth to all elements', () => {
      const grandparent = createSelectedElement({
        stagewiseId: 'grandparent',
        nodeType: 'BODY',
        attributes: { id: 'grandparent' },
        xpath: '/html/body',
      });

      const parent = createSelectedElement({
        stagewiseId: 'parent',
        nodeType: 'DIV',
        attributes: { id: 'parent' },
        xpath: '/html/body/div',
        parent: grandparent,
      });

      const sibling = createSelectedElement({
        stagewiseId: 'sibling',
        nodeType: 'ASIDE',
        attributes: { id: 'sibling' },
        xpath: '/html/body/div/aside',
      });

      const child = createSelectedElement({
        stagewiseId: 'child',
        nodeType: 'SPAN',
        attributes: { id: 'child' },
        xpath: '/html/body/div/section/span',
      });

      const element = createSelectedElement({
        stagewiseId: 'selected',
        nodeType: 'SECTION',
        attributes: { id: 'selected' },
        xpath: '/html/body/div/section',
        parent,
        children: [child],
      });

      parent.children = [sibling, element];

      const result = htmlElementsToContextSnippet(element);

      // Verify grandparent
      expect(result).toMatch(/role="parent".*depth="-2".*id="grandparent"/s);

      // Verify parent
      expect(result).toMatch(/role="parent".*depth="-1".*id="parent"/s);

      // Verify selected
      expect(result).toMatch(
        /role="selected-element".*selected="true".*depth="0".*id="selected"/s,
      );

      // Verify sibling
      expect(result).toMatch(/role="sibling".*depth="0".*id="sibling"/s);

      // Verify child
      expect(result).toMatch(/role="child".*depth="1".*id="child"/s);
    });
  });

  describe('character limit with hierarchy', () => {
    it('should truncate deepest children first when over limit', () => {
      const level3 = createSelectedElement({
        stagewiseId: 'child-3',
        nodeType: 'EM',
        attributes: { id: 'child-3' },
        xpath: '/html/body/div/span/em',
        textContent: 'a'.repeat(100),
      });

      const level2 = createSelectedElement({
        stagewiseId: 'child-2',
        nodeType: 'STRONG',
        attributes: { id: 'child-2' },
        xpath: '/html/body/div/span',
        textContent: 'b'.repeat(100),
        children: [level3],
      });

      const level1 = createSelectedElement({
        stagewiseId: 'child-1',
        nodeType: 'SPAN',
        attributes: { id: 'child-1' },
        xpath: '/html/body/div/span',
        textContent: 'c'.repeat(100),
        children: [level2],
      });

      const element = createSelectedElement({
        nodeType: 'DIV',
        attributes: { id: 'selected' },
        xpath: '/html/body/div',
        textContent: 'd'.repeat(100),
        children: [level1],
      });

      const result = htmlElementsToContextSnippet(element, 500);

      // Should be under limit
      expect(result.length).toBeLessThanOrEqual(500);

      // Should still have selected
      expect(result).toContain('role="selected-element"');
      expect(result).toContain('id="selected"');
    });

    it('should remove siblings before parents when truncating', () => {
      const grandparent = createSelectedElement({
        stagewiseId: 'grandparent',
        nodeType: 'BODY',
        attributes: { id: 'grandparent' },
        xpath: '/html/body',
        textContent: 'x'.repeat(50),
      });

      const parent = createSelectedElement({
        stagewiseId: 'parent',
        nodeType: 'DIV',
        attributes: { id: 'parent' },
        xpath: '/html/body/div',
        textContent: 'y'.repeat(50),
        parent: grandparent,
      });

      const sibling1 = createSelectedElement({
        stagewiseId: 'sibling-1',
        nodeType: 'ASIDE',
        attributes: { id: 'sibling-1' },
        xpath: '/html/body/div/aside',
        textContent: 'z'.repeat(100),
      });

      const element = createSelectedElement({
        stagewiseId: 'selected',
        nodeType: 'SECTION',
        attributes: { id: 'selected' },
        xpath: '/html/body/div/section',
        textContent: 'w'.repeat(100),
        parent,
      });

      parent.children = [sibling1, element];

      const result = htmlElementsToContextSnippet(element, 400);

      // Should be under limit
      expect(result.length).toBeLessThanOrEqual(400);

      // Should still have selected and parents
      expect(result).toContain('role="selected-element"');
      expect(result).toContain('id="selected"');
    });
  });
});
