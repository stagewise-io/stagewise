import type { ToolbarContext } from '@stagewise/toolbar';
import { useState, useEffect, type JSX } from '@stagewise/toolbar/plugin-ui';
import type axe from 'axe-core';

// Define allowed impact levels
type ImpactLevel = 'critical' | 'serious' | 'moderate' | 'minor' | 'unknown';

interface AxeResultsPanelProps {
  results: axe.AxeResults;
  context: ToolbarContext;
}

export default function AxeResultsPanel({
  results,
  context,
}: AxeResultsPanelProps): JSX.Element {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [htmlVisible, setHtmlVisible] = useState<
    Record<string, Record<number, boolean>>
  >({});

  // Initialize state when violations change
  useEffect(() => {
    const initExpanded: Record<string, boolean> = {};
    const initHtml: Record<string, Record<number, boolean>> = {};
    results.violations.forEach((v) => {
      initExpanded[v.id] = false;
      initHtml[v.id] = {};
      v.nodes.forEach((_, idx) => {
        initHtml[v.id][idx] = false;
      });
    });
    setExpanded(initExpanded);
    setHtmlVisible(initHtml);
  }, [results.violations]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleHtml = (violationId: string, idx: number) => {
    setHtmlVisible((prev) => ({
      ...prev,
      [violationId]: {
        ...prev[violationId],
        [idx]: !prev[violationId][idx],
      },
    }));
  };

  const getImpactColor = (impact: ImpactLevel): string => {
    switch (impact) {
      case 'critical':
        return 'border-red-600';
      case 'serious':
        return 'border-orange-600';
      case 'moderate':
        return 'border-yellow-700';
      case 'minor':
        return 'border-green-700';
      default:
        return 'border-gray-400';
    }
  };

  const getBadgeClasses = (impact: ImpactLevel): string => {
    switch (impact) {
      case 'critical':
        return 'bg-red-100 text-red-600';
      case 'serious':
        return 'bg-orange-100 text-orange-600';
      case 'moderate':
        return 'bg-yellow-100 text-yellow-700';
      case 'minor':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-200 text-gray-600';
    }
  };

  const highlightElement = (selector: string | string[]) => {
    try {
      const sel = Array.isArray(selector) ? selector.join(', ') : selector;
      const elements = document.querySelectorAll(sel);
      elements.forEach((el) => {
        const orig = (el as HTMLElement).style.outline;
        (el as HTMLElement).style.outline = '3px solid red';
        (el as HTMLElement).scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
        setTimeout(() => {
          (el as HTMLElement).style.outline = orig;
        }, 5000);
      });
    } catch (e) {
      console.error('Highlight error', e);
    }
  };

  return (
    <div class=" right-5 bottom-5 z-50 flex max-h-[80vh] w-96 flex-col overflow-hidden rounded-lg bg-white font-sans shadow-xl">
      {/* Header */}
      <div class="flex items-center justify-between border-gray-200 border-b bg-gray-100 p-4">
        <h2 class="m-0 font-semibold text-gray-800 text-lg">
          Accessibility Audit Results
        </h2>
        <button
          type="button"
          class="cursor-pointer border-none bg-none text-gray-600 text-xl"
          onClick={() => {
            const panel = document.getElementById('axe-results-panel');
            if (panel) panel.remove();
          }}
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-y-auto p-4">
        <div
          class={`mb-4 rounded-md p-3 font-medium ${results.violations.length === 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
        >
          {results.violations.length === 0
            ? '✓ No accessibility issues found!'
            : `Found ${results.violations.length} accessibility issue${results.violations.length !== 1 ? 's' : ''}`}
        </div>

        {results.violations.length > 0 && (
          <ul class="m-0 list-none p-0">
            {results.violations.map((violation) => {
              const impact = (violation.impact as ImpactLevel) || 'unknown';
              return (
                <li
                  key={violation.id}
                  class={`mb-4 rounded-md border-l-4 bg-gray-50 p-3 ${getImpactColor(impact)}`}
                >
                  <div class="mb-2 flex items-center justify-between">
                    <h3 class="m-0 font-semibold">{violation.id}</h3>
                    <span
                      class={`rounded px-2 py-1 text-xs capitalize ${getBadgeClasses(impact)}`}
                    >
                      {impact}
                    </span>
                  </div>
                  <p class="mb-2">{violation.description}</p>
                  <p class="mb-2">
                    {violation.help}{' '}
                    <a
                      href={violation.helpUrl}
                      target="_blank"
                      class="text-blue-600 underline"
                    >
                      Learn more
                    </a>
                  </p>
                  <p class="mt-2 font-medium">
                    Affected elements: {violation.nodes.length}
                  </p>

                  {violation.nodes.length > 0 && (
                    <>
                      <button
                        class="mb-1 cursor-pointer border-none bg-none py-1 text-left text-blue-600 text-sm"
                        onClick={() => toggleExpanded(violation.id)}
                        type="button"
                      >
                        {expanded[violation.id]
                          ? 'Hide affected elements'
                          : 'Show affected elements'}
                      </button>

                      {expanded[violation.id] && (
                        <div class="my-2 border-gray-200 border-l-2 pl-3">
                          {violation.nodes.map((node, idx) => (
                            <div key={node.target} class="mb-2 break-words">
                              <strong>Element {idx + 1}</strong>
                              {node.failureSummary && (
                                <p>{node.failureSummary}</p>
                              )}

                              {/* Show HTML toggle */}
                              <button
                                type="button"
                                class="mt-1 mr-2 cursor-pointer border-none bg-none text-blue-600 text-xs underline"
                                onClick={() => toggleHtml(violation.id, idx)}
                              >
                                {htmlVisible[violation.id]?.[idx]
                                  ? 'Hide HTML'
                                  : 'Show HTML'}
                              </button>

                              {htmlVisible[violation.id]?.[idx] && (
                                <pre class="my-1 max-h-[100px] overflow-y-auto whitespace-pre-wrap rounded bg-gray-200 p-1 font-mono text-xs">
                                  {node.html}
                                </pre>
                              )}

                              {/* Highlight button */}
                              {node.target && (
                                <button
                                  type="button"
                                  class="mt-1 mr-2 cursor-pointer border-none bg-none text-blue-600 text-xs underline"
                                  onClick={() =>
                                    highlightElement(
                                      node.target as string | string[],
                                    )
                                  }
                                >
                                  Highlight in page
                                </button>
                              )}

                              {/* Fix with AI button */}
                              <button
                                type="button"
                                class="mt-1 cursor-pointer rounded bg-green-500 px-2 py-1 text-white text-xs"
                                onClick={() => {
                                  const prompt = `The following accessibility violation was detected:\nViolation ID: ${violation.id}\nDescription: ${violation.description}\nHelp: ${violation.help} (More info: ${violation.helpUrl})\n\nAffected Element (HTML):\n\`\`\`html\n${node.html}\n\`\`\`\n\nElement Selector: ${Array.isArray(node.target) ? node.target.join(', ') : String(node.target)}\nFailure Summary: ${node.failureSummary}\n\nPlease provide a fix for this accessibility issue.`;
                                  context.sendPrompt(prompt);
                                  alert(
                                    'Prompt sent to AI to fix the issue. Check the chat for suggestions.',
                                  );
                                }}
                              >
                                Fix with AI
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
