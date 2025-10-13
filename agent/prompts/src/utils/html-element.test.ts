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
    nodeType: 'DIV',
    xpath: '/html/body/div',
    attributes: {},
    textContent: '',
    ownProperties: {},
    boundingClientRect: { top: 0, left: 0, width: 0, height: 0 },
    pluginInfo: [],
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
      expect(result).toContain('truncated="true"');
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
      expect(result).toContain('truncated="true"');
      expect(result.length).toBeLessThanOrEqual(300);
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
});
