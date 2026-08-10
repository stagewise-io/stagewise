import posthog from 'posthog-js';
import type { MermaidConfig } from 'mermaid';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@ui/utils';
import { getMermaidCache } from '@ui/hooks/use-mermaid-cache';
import { useOpenImageTab } from '@ui/hooks/use-open-image-tab';

const initializeMermaid = async (customConfig?: MermaidConfig) => {
  const defaultConfig: MermaidConfig = {
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'strict',
    fontFamily: 'monospace',
    suppressErrorRendering: true,
  } as MermaidConfig;

  const config = { ...defaultConfig, ...customConfig };

  const mermaidModule = await import('mermaid');
  const mermaid = mermaidModule.default;

  mermaid.initialize(config);

  return mermaid;
};

const mermaidCache = getMermaidCache();

type MermaidProps = {
  chart: string;
  className?: string;
  config?: MermaidConfig;
  openInTab?: boolean;
};

export const Mermaid = ({
  chart,
  className,
  config,
  openInTab = false,
}: MermaidProps) => {
  const openImageTab = useOpenImageTab();
  const cachedEntry = mermaidCache.get(chart, config);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!cachedEntry);
  const [svgContent, setSvgContent] = useState<string>(
    cachedEntry?.svgHtml ?? '',
  );
  const [lastValidSvg, setLastValidSvg] = useState<string>(
    cachedEntry?.svgHtml ?? '',
  );
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const cached = mermaidCache.get(chart, config);
    if (cached) {
      setSvgContent(cached.svgHtml);
      setLastValidSvg(cached.svgHtml);
      setIsLoading(false);
      setError(null);
      return () => {
        mountedRef.current = false;
      };
    }

    const renderChart = async () => {
      try {
        setError(null);
        setIsLoading(true);

        const mermaid = await initializeMermaid(config);

        const chartHash = chart.split('').reduce((acc, char) => {
          return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
        }, 0);
        const uniqueId = `mermaid-${Math.abs(chartHash)}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        const { svg } = await mermaid.render(uniqueId, chart);

        mermaidCache.set(chart, config, svg);

        if (mountedRef.current) {
          setSvgContent(svg);
          setLastValidSvg(svg);
        }
      } catch (err) {
        posthog.captureException(
          err instanceof Error ? err : new Error(String(err)),
          { source: 'renderer', operation: 'mermaidRender' },
        );

        if (mountedRef.current && !(lastValidSvg || svgContent)) {
          const errorMessage =
            err instanceof Error
              ? err.message
              : 'Failed to render Mermaid chart';
          setError(errorMessage);
        }
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    renderChart();

    return () => {
      mountedRef.current = false;
    };
  }, [chart, config]);

  if (isLoading && !svgContent && !lastValidSvg) {
    return (
      <div className={cn('my-4 flex justify-center p-4', className)}>
        <div className="flex items-center space-x-2 text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-current border-b-2" />
          <span className="text-sm">Loading diagram...</span>
        </div>
      </div>
    );
  }

  if (error && !svgContent && !lastValidSvg) {
    return (
      <div
        className={cn(
          'rounded-lg border border-error/30 bg-error/10 p-4',
          className,
        )}
      >
        <p className="font-mono text-error text-sm">Mermaid Error: {error}</p>
        <details className="mt-2">
          <summary className="cursor-pointer text-error text-xs">
            Show Code
          </summary>
          <pre className="mt-2 overflow-x-auto rounded bg-error/10 p-2 text-error text-xs">
            {chart}
          </pre>
        </details>
      </div>
    );
  }

  const displaySvg = svgContent || lastValidSvg;

  if (openInTab) {
    return (
      <button
        type="button"
        aria-label="Open Mermaid chart in tab"
        className={cn(
          'my-4 flex cursor-pointer justify-center rounded-md',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-solid',
          className,
        )}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          const svg = event.currentTarget.querySelector('svg');
          if (!svg) return;
          const exportedSvg = svg.cloneNode(true) as SVGSVGElement;
          const { width, height } = svg.viewBox.baseVal;
          if (width && height) {
            exportedSvg.setAttribute('width', String(width));
            exportedSvg.setAttribute('height', String(height));
          }
          openImageTab(
            'Mermaid chart',
            `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
              new XMLSerializer().serializeToString(exportedSvg),
            )}`,
            'image/svg+xml',
          );
        }}
        dangerouslySetInnerHTML={{ __html: displaySvg }}
      />
    );
  }

  return (
    <div
      aria-label="Mermaid chart"
      className={cn('my-4 flex justify-center', className)}
      dangerouslySetInnerHTML={{ __html: displaySvg }}
      role="img"
    />
  );
};
