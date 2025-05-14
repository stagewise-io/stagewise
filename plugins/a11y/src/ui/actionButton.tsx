import {
  ToolbarButton,
  useCallback,
  useToolbar,
  useState,
  useEffect,
} from '@stagewise/toolbar/plugin-ui';
import type { FunctionComponent } from '@stagewise/toolbar/plugin-ui';
import type { PanelHandle } from '@stagewise/toolbar';
import axe from 'axe-core';

// Panel component to display accessibility results
const ResultsPanel: FunctionComponent<{ results: any }> = ({ results }) => {
  if (!results) {
    return <div>Loading accessibility results...</div>;
  }

  if (results.error) {
    return (
      <div>Error running accessibility check: {String(results.error)}</div>
    );
  }

  const { violations } = results;

  return (
    <div style={{ padding: '16px', overflowY: 'auto', height: '100%' }}>
      <h2 style={{ margin: '0 0 16px 0' }}>Accessibility Analysis</h2>

      {violations.length === 0 ? (
        <div style={{ color: 'green', fontWeight: 'bold' }}>
          No accessibility violations found. Great job!
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '16px' }}>
            <span style={{ color: 'red', fontWeight: 'bold' }}>
              Found {violations.length} issue
              {violations.length !== 1 ? 's' : ''}
            </span>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {violations.map((violation: any) => (
              <li
                key={violation.id}
                style={{
                  marginBottom: '24px',
                  padding: '16px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                }}
              >
                <h3 style={{ margin: '0 0 8px 0' }}>{violation.help}</h3>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Impact:</strong> {violation.impact}
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong>Description:</strong> {violation.description}
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <strong>WCAG:</strong>{' '}
                  {violation.tags
                    .filter((tag: string) => tag.startsWith('wcag'))
                    .join(', ')}
                </div>
                <div>
                  <strong>Affected elements:</strong> {violation.nodes.length}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};

// Simple test panel to verify rendering
const TestPanel: FunctionComponent = () => {
  return (
    <div style={{ padding: '20px', background: 'lightgreen', height: '100%' }}>
      <h2>Test Panel</h2>
      <p>If you can see this, panels are working!</p>
    </div>
  );
};

export const ToolbarAction: FunctionComponent = () => {
  const context = useToolbar();
  const [activePanel, setActivePanel] = useState<PanelHandle | null>(null);
  const [isAnalysisRunning, setIsAnalysisRunning] = useState(false);
  const [results, setResults] = useState<any>(null);

  // Clean up panel when component unmounts
  useEffect(() => {
    return () => {
      if (activePanel) {
        activePanel.remove();
      }
    };
  }, [activePanel]);

  const runAccessibilityCheck = async () => {
    setIsAnalysisRunning(true);
    try {
      // Configure axe with needed settings
      axe.configure({
        reporter: 'v2',
      });

      // Run the accessibility analysis
      const axeResults = await axe.run(document, {
        resultTypes: ['violations'],
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
        },
      });

      // Log raw results to console for debugging
      console.log('Axe accessibility results:', axeResults);
      setResults(axeResults);

      // Update the panel with results if it exists
      if (activePanel) {
        activePanel.updateContent(() => <ResultsPanel results={axeResults} />);
      }

      return axeResults;
    } catch (error) {
      console.error('Error running accessibility check:', error);
      setResults({ error });

      // Update panel with error state if it exists
      if (activePanel) {
        activePanel.updateContent(() => <ResultsPanel results={{ error }} />);
      }

      return { error };
    } finally {
      setIsAnalysisRunning(false);
    }
  };

  const clickHandler = useCallback(async () => {
    // If there's already an active panel, close it
    if (activePanel) {
      activePanel.remove();
      setActivePanel(null);
      return;
    }

    // Create a new panel
    const panel = context.openPanel(
      () => <ResultsPanel results={results || null} />,
      {
        title: 'Accessibility Analysis',
        width: 500,
        height: 600,
        position: 'bottomRight',
        resizable: true,
      },
    );

    setActivePanel(panel);

    // Run the analysis if no results yet
    if (!results) {
      runAccessibilityCheck();
    }
  }, [context, activePanel, results]);

  return (
    <ToolbarButton
      style={{
        fontWeight: 700,
        fontSize: '0.70em',
        fontStretch: '90%',
        letterSpacing: '-0.05em',
        background: activePanel ? '#e6f7ff' : undefined,
        border: activePanel ? '1px solid #91d5ff' : undefined,
      }}
      onClick={clickHandler}
      disabled={isAnalysisRunning}
    >
      A11y
    </ToolbarButton>
  );
};
