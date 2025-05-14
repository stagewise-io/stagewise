import {
  ToolbarButton,
  useCallback,
  useToolbar,
} from '@stagewise/toolbar/plugin-ui';
import type { FunctionComponent } from '@stagewise/toolbar/plugin-ui';
import type { ToolbarContext } from '@stagewise/toolbar';
import axe from 'axe-core';

export const ToolbarAction: FunctionComponent = () => {
  const context = useToolbar();

  const clickHandler = useCallback(async () => {
    try {
      // Configure axe with needed settings
      axe.configure({
        reporter: 'v2',
      });

      // Run the accessibility analysis
      const results = await axe.run(document, {
        resultTypes: ['violations'],
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
        },
      });

      // Log raw results to console for debugging
      console.log('Axe accessibility results:', results);

      // Create and show UI for results
      showResultsPanel(results, context);

      return results;
    } catch (error) {
      console.error('Error running accessibility check:', error);
      alert('Error running accessibility check. See console for details.');
      return { error };
    }
  }, [context]);

  return (
    <ToolbarButton
      style={{
        fontWeight: 700,
        fontSize: '0.70em',
        fontStretch: '90%',
        letterSpacing: '-0.05em',
      }}
      onClick={clickHandler}
    >
      A11y
    </ToolbarButton>
  );
};

// Define allowed impact levels
type ImpactLevel = 'critical' | 'serious' | 'moderate' | 'minor' | 'unknown';

interface StylesMap {
  container: string;
  header: string;
  title: string;
  closeButton: string;
  content: string;
  summary: string;
  success: string;
  error: string;
  violationList: string;
  violation: string;
  critical: string;
  serious: string;
  moderate: string;
  minor: string;
  violationHeader: string;
  violationTitle: string;
  violationImpact: string;
  criticalBadge: string;
  seriousBadge: string;
  moderateBadge: string;
  minorBadge: string;
  unknownBadge: string;
  violationDescription: string;
  violationHelp: string;
  violationHelpLink: string;
  affectedElements: string;
  expandButton: string;
  elementList: string;
  elementItem: string;
  elementHtml: string;
  showHtmlButton: string;
  aiFixButton: string;
}

// Styles for the results panel
const styles: StylesMap = {
  container: `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 400px;
    max-height: 80vh;
    background-color: #fff;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    overflow: hidden;
    z-index: 10000;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    display: flex;
    flex-direction: column;
  `,
  header: `
    padding: 16px;
    background-color: #f5f5f5;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `,
  title: `
    font-size: 18px;
    font-weight: 600;
    margin: 0;
    color: #333;
  `,
  closeButton: `
    background: none;
    border: none;
    cursor: pointer;
    font-size: 20px;
    color: #666;
  `,
  content: `
    padding: 16px;
    overflow-y: auto;
    flex: 1;
  `,
  summary: `
    margin-bottom: 16px;
    padding: 12px;
    border-radius: 6px;
    font-weight: 500;
  `,
  success: `
    background-color: #e6f7ed;
    color: #1e8e3e;
  `,
  error: `
    background-color: #fce8e6;
    color: #d93025;
  `,
  violationList: `
    list-style-type: none;
    padding: 0;
    margin: 0;
  `,
  violation: `
    margin-bottom: 16px;
    padding: 12px;
    border-radius: 6px;
    border-left: 4px solid;
    background-color: #f8f9fa;
  `,
  critical: `border-color: #d93025;`,
  serious: `border-color: #e65100;`,
  moderate: `border-color: #e6a700;`,
  minor: `border-color: #2e7d32;`,
  violationHeader: `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  `,
  violationTitle: `
    font-weight: 600;
    margin: 0;
  `,
  violationImpact: `
    font-size: 12px;
    padding: 4px 8px;
    border-radius: 4px;
    text-transform: capitalize;
  `,
  criticalBadge: `background-color: #fce8e6; color: #d93025;`,
  seriousBadge: `background-color: #fef7e0; color: #e65100;`,
  moderateBadge: `background-color: #fef7e0; color: #e6a700;`,
  minorBadge: `background-color: #e6f7ed; color: #2e7d32;`,
  unknownBadge: `background-color: #f1f3f4; color: #666;`,
  violationDescription: `
    margin-bottom: 8px;
  `,
  violationHelp: `
    margin-bottom: 8px;
  `,
  violationHelpLink: `
    color: #1a73e8;
    text-decoration: none;
  `,
  affectedElements: `
    font-weight: 500;
    margin-top: 8px;
  `,
  expandButton: `
    background: none;
    border: none;
    cursor: pointer;
    color: #1a73e8;
    padding: 4px 0;
    font-size: 14px;
    text-align: left;
    margin: 4px 0;
  `,
  elementList: `
    border-left: 2px solid #e0e0e0;
    padding-left: 12px;
    margin: 8px 0;
  `,
  elementItem: `
    margin-bottom: 8px;
    word-break: break-all;
  `,
  elementHtml: `
    font-family: monospace;
    background-color: #f1f3f4;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    margin: 4px 0;
    white-space: pre-wrap;
    max-height: 100px;
    overflow-y: auto;
  `,
  showHtmlButton: `
    background: none;
    border: none;
    cursor: pointer;
    color: #1a73e8;
    padding: 2px 0;
    font-size: 12px;
    text-decoration: underline;
    margin-top: 4px;
    margin-right: 8px;
  `,
  aiFixButton: `
    background-color: #4CAF50; /* Green */
    border: none;
    color: white;
    padding: 4px 8px;
    text-align: center;
    text-decoration: none;
    display: inline-block;
    font-size: 12px;
    margin-top: 4px;
    cursor: pointer;
    border-radius: 4px;
  `,
};

// Create and show the results panel
function showResultsPanel(results: axe.AxeResults, context: ToolbarContext) {
  // Remove any existing panel
  const existingPanel = document.getElementById('axe-results-panel');
  if (existingPanel) {
    existingPanel.remove();
  }

  // Create container
  const container = document.createElement('div');
  container.id = 'axe-results-panel';
  container.setAttribute('style', styles.container);

  // Create header
  const header = document.createElement('div');
  header.setAttribute('style', styles.header);

  const title = document.createElement('h2');
  title.setAttribute('style', styles.title);
  title.textContent = 'Accessibility Audit Results';

  const closeButton = document.createElement('button');
  closeButton.setAttribute('style', styles.closeButton);
  closeButton.textContent = '×';
  closeButton.addEventListener('click', () => container.remove());

  header.appendChild(title);
  header.appendChild(closeButton);
  container.appendChild(header);

  // Create content
  const content = document.createElement('div');
  content.setAttribute('style', styles.content);
  container.appendChild(content);

  // Add summary
  const summary = document.createElement('div');

  if (results.violations.length === 0) {
    summary.setAttribute('style', `${styles.summary} ${styles.success}`);
    summary.textContent = '✓ No accessibility issues found!';
  } else {
    summary.setAttribute('style', `${styles.summary} ${styles.error}`);
    summary.textContent = `Found ${results.violations.length} accessibility issue${results.violations.length !== 1 ? 's' : ''}`;
  }
  content.appendChild(summary);

  // If there are violations, show them
  if (results.violations.length > 0) {
    const violationList = document.createElement('ul');
    violationList.setAttribute('style', styles.violationList);

    results.violations.forEach((violation: any) => {
      const impact = (violation.impact as ImpactLevel) || 'unknown';
      const violationItem = document.createElement('li');

      // Get the style for the impact level, defaulting to empty string if not found
      const impactStyle =
        impact === 'critical' ||
        impact === 'serious' ||
        impact === 'moderate' ||
        impact === 'minor'
          ? styles[impact]
          : '';

      violationItem.setAttribute('style', `${styles.violation} ${impactStyle}`);

      // Create violation header
      const violationHeader = document.createElement('div');
      violationHeader.setAttribute('style', styles.violationHeader);

      const violationTitle = document.createElement('h3');
      violationTitle.setAttribute('style', styles.violationTitle);
      violationTitle.textContent = violation.id;

      const violationImpact = document.createElement('span');
      // Get the badge style for the impact level
      const badgeStyle = `${impact}Badge` as
        | 'criticalBadge'
        | 'seriousBadge'
        | 'moderateBadge'
        | 'minorBadge'
        | 'unknownBadge';
      violationImpact.setAttribute(
        'style',
        `${styles.violationImpact} ${styles[badgeStyle] || styles.unknownBadge}`,
      );
      violationImpact.textContent = impact;

      violationHeader.appendChild(violationTitle);
      violationHeader.appendChild(violationImpact);
      violationItem.appendChild(violationHeader);

      // Add description
      const description = document.createElement('p');
      description.setAttribute('style', styles.violationDescription);
      description.textContent = violation.description;
      violationItem.appendChild(description);

      // Add help text with link
      const help = document.createElement('p');
      help.setAttribute('style', styles.violationHelp);

      const helpText = document.createTextNode(`${violation.help} `);
      help.appendChild(helpText);

      const helpLink = document.createElement('a');
      helpLink.setAttribute('style', styles.violationHelpLink);
      helpLink.href = violation.helpUrl;
      helpLink.target = '_blank';
      helpLink.textContent = 'Learn more';
      help.appendChild(helpLink);

      violationItem.appendChild(help);

      // Add affected elements count
      const affectedElements = document.createElement('p');
      affectedElements.setAttribute('style', styles.affectedElements);
      affectedElements.textContent = `Affected elements: ${violation.nodes.length}`;
      violationItem.appendChild(affectedElements);

      // Add expand button for elements
      if (violation.nodes.length > 0) {
        const expandButton = document.createElement('button');
        expandButton.setAttribute('style', styles.expandButton);
        expandButton.textContent = 'Show affected elements';

        const elementList = document.createElement('div');
        elementList.setAttribute('style', styles.elementList);
        elementList.style.display = 'none';

        violation.nodes.forEach((node: any, i: number) => {
          const elementItem = document.createElement('div');
          elementItem.setAttribute('style', styles.elementItem);

          const elementTitle = document.createElement('strong');
          elementTitle.textContent = `Element ${i + 1}`;
          elementItem.appendChild(elementTitle);

          if (node.failureSummary) {
            const failureSummary = document.createElement('p');
            failureSummary.textContent = node.failureSummary;
            elementItem.appendChild(failureSummary);
          }

          // Add button to show HTML
          const showHtmlButton = document.createElement('button');
          showHtmlButton.setAttribute('style', styles.showHtmlButton);
          showHtmlButton.textContent = 'Show HTML';

          const htmlCode = document.createElement('pre');
          htmlCode.setAttribute('style', styles.elementHtml);
          htmlCode.textContent = node.html;
          htmlCode.style.display = 'none';

          showHtmlButton.addEventListener('click', () => {
            if (htmlCode.style.display === 'none') {
              htmlCode.style.display = 'block';
              showHtmlButton.textContent = 'Hide HTML';
            } else {
              htmlCode.style.display = 'none';
              showHtmlButton.textContent = 'Show HTML';
            }
          });

          elementItem.appendChild(showHtmlButton);
          elementItem.appendChild(htmlCode);

          // Add button to highlight element if possible
          if (node.target) {
            const highlightButton = document.createElement('button');
            highlightButton.setAttribute('style', styles.showHtmlButton);
            highlightButton.textContent = 'Highlight in page';
            highlightButton.addEventListener('click', () => {
              try {
                const selector = Array.isArray(node.target)
                  ? node.target.join(', ')
                  : String(node.target);
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                  elements.forEach((el) => highlightElement(el as HTMLElement));
                }
              } catch (error) {
                console.log('Could not highlight element:', error);
              }
            });
            elementItem.appendChild(highlightButton);
          }

          // Add "Fix with AI" button for each node
          const fixButton = document.createElement('button');
          fixButton.setAttribute('style', styles.aiFixButton);
          fixButton.textContent = 'Fix with AI';
          fixButton.addEventListener('click', () => {
            const prompt = `The following accessibility violation was detected:
  Violation ID: ${violation.id}
  Description: ${violation.description}
  Help: ${violation.help} (More info: ${violation.helpUrl})
 
  Affected Element (HTML):
  \`\`\`html
  ${node.html}
  \`\`\`
 
  Element Selector: ${Array.isArray(node.target) ? node.target.join(', ') : String(node.target)}
  Failure Summary: ${node.failureSummary}
 
  Please provide a fix for this accessibility issue.`;
            context.sendPrompt(prompt);
            // Optionally, provide feedback to the user, e.g., close the panel or show a message
            // For now, we just send the prompt.
            alert(
              'Prompt sent to AI to fix the issue. Check the chat for suggestions.',
            );
          });
          elementItem.appendChild(fixButton);

          elementList.appendChild(elementItem);
        });

        expandButton.addEventListener('click', () => {
          if (elementList.style.display === 'none') {
            elementList.style.display = 'block';
            expandButton.textContent = 'Hide affected elements';
          } else {
            elementList.style.display = 'none';
            expandButton.textContent = 'Show affected elements';
          }
        });

        violationItem.appendChild(expandButton);
        violationItem.appendChild(elementList);
      }

      violationList.appendChild(violationItem);
    });

    content.appendChild(violationList);
  }

  // Append to document
  document.body.appendChild(container);
}

// Helper function to get color based on impact severity
function getImpactColor(impact: string): string {
  switch (impact) {
    case 'critical':
      return '#d93025';
    case 'serious':
      return '#e65100';
    case 'moderate':
      return '#e6a700';
    case 'minor':
      return '#2e7d32';
    default:
      return '#000000';
  }
}

// Helper function to temporarily highlight an element
function highlightElement(element: HTMLElement): void {
  // Save original styles
  const originalOutline = element.style.outline;
  const originalScrollBehavior = document.documentElement.style.scrollBehavior;

  // Apply highlight
  element.style.outline = '3px solid red';
  document.documentElement.style.scrollBehavior = 'smooth';

  // Scroll element into view
  element.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  });

  // Remove highlight after a delay
  setTimeout(() => {
    element.style.outline = originalOutline;
    document.documentElement.style.scrollBehavior = originalScrollBehavior;
  }, 5000);
}
