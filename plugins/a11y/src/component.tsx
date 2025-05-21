import {
  Panel,
  Button,
  useToolbar,
  useEffect,
  useState,
  Badge,
} from '@stagewise/toolbar/plugin-ui';
import axe from 'axe-core';

// Define allowed impact levels
type ImpactLevel = 'critical' | 'serious' | 'moderate' | 'minor' | 'unknown';

interface Prompt {
  prompt: string;
  files: any[];
  images: any[];
}

interface Filters {
  impact: ImpactLevel[];
  wcagLevel: string[];
}

const impactLevels: ImpactLevel[] = [
  'critical',
  'serious',
  'moderate',
  'minor',
  'unknown',
];
const wcagLevels = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'best-practice',
];

export const A11yComponent = () => {
  const toolbar = useToolbar();
  const [results, setResults] = useState<axe.AxeResults | null>(null);
  const [filters, setFilters] = useState<Filters>({
    impact: [...impactLevels],
    wcagLevel: [...wcagLevels],
  });

  useEffect(() => {
    const runAudit = async () => {
      axe.configure({ reporter: 'v2' });
      try {
        const res = await axe.run(document, {
          resultTypes: ['violations'],
          runOnly: { type: 'tag', values: filters.wcagLevel },
        });
        setResults(res);
      } catch {
        alert('Error running accessibility check.');
      }
    };
    runAudit();
  }, [filters.wcagLevel]);

  const filtered =
    results?.violations.filter((v) => {
      const matches = filters.impact.includes(v.impact as ImpactLevel);
      return matches;
    }) || [];

  const toggleImpact = (level: ImpactLevel | 'all') => {
    if (level === 'all') {
      setFilters((f) => ({ ...f, impact: impactLevels }));
    } else {
      setFilters((f) => ({
        ...f,
        impact: f.impact.includes(level)
          ? f.impact.filter((i) => i !== level)
          : [...f.impact, level],
      }));
    }
  };

  return (
    <Panel>
      <Panel.Header title="Accessibility Checker" />
      <Panel.Content>
        {/* Filters */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'stretch',
            justifyContent: 'flex-start',
            padding: 12,
            gap: 8,
          }}
        >
          {['all', ...impactLevels].map((lvl) => {
            const isAll = lvl === 'all';
            const background = isAll
              ? '#e0e0e0'
              : lvl === 'moderate'
                ? '#ffe58f'
                : '#ffa39e';
            const borderColor = isAll
              ? '#ccc'
              : lvl === 'moderate'
                ? '#ffc53d'
                : '#ff4d4f';
            const badgeColor = isAll
              ? 'blue'
              : lvl === 'moderate'
                ? 'yellow'
                : 'red';

            return (
              <Button
                key={lvl}
                asChild
                style="outline"
                size="sm"
                onClick={() => toggleImpact(lvl as ImpactLevel | 'all')}
              >
                <Badge color={badgeColor} style="outline">
                  {lvl}
                </Badge>
              </Button>
            );
          })}
        </div>

        {/* Violations List */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            justifyContent: 'flex-start',
            padding: 0,
            gap: 0,
            marginTop: 12,
          }}
        >
          {filtered.map((v) => (
            <div
              key={v.id}
              style={{
                display: 'flex',
                width: '100%',
                padding: 12,
                marginBottom: 8,
                border: '1px solid #ccc',
                borderRadius: 4,
                textAlign: 'left',
                backdropFilter: 'blur(12px)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flex: 1,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: v.impact === 'moderate' ? '#ad8b00' : '#a8071a',
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{ color: '#000', fontSize: 14, lineHeight: '20px' }}
                >
                  {v.description}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  style="primary"
                  size="sm"
                  onClick={() =>
                    toolbar.sendPrompt({
                      prompt: `Please help fix the following accessibility issue:

VIOLATION DETAILS:
- Description: ${v.description}
- Impact Level: ${v.impact}
- WCAG Guidelines: ${v.tags.join(', ')}
- Help URL: ${v.helpUrl}

AFFECTED ELEMENTS:
${v.nodes
  .map(
    (node) => `
Element: ${node.html}
Location: ${node.target.join(' ')}
Summary: ${node.failureSummary}
Fix Suggestions: ${node.all.map((check) => check.message).join('\n')}
`,
  )
  .join('\n')}

Please provide:
1. A clear explanation of the accessibility issue
2. The specific WCAG guidelines being violated
3. Step-by-step fixes needed
4. The corrected code for each affected element
`,
                      files: v.nodes.map((node) => node.target.join(' ')),
                      images: [],
                    })
                  }
                >
                  Fix with AI
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Panel.Content>
    </Panel>
  );
};
