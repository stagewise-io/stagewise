import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import { AlertTriangleIcon } from 'lucide-react';

interface TabErrorBoundaryProps {
  /** Unique key — changing this resets the error state (e.g. tabId). */
  tabId: string;
  children: ReactNode;
}

interface TabErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class TabErrorBoundary extends Component<
  TabErrorBoundaryProps,
  TabErrorBoundaryState
> {
  constructor(props: TabErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): TabErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[TabErrorBoundary] tab=${this.props.tabId}`,
      error,
      errorInfo.componentStack,
    );
  }

  /** Reset error state when tabId changes — the tab was recreated or replaced. */
  componentDidUpdate(prevProps: TabErrorBoundaryProps) {
    if (prevProps.tabId !== this.props.tabId && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-surface-1 p-6">
          <AlertTriangleIcon className="size-8 text-muted-foreground" />
          <div className="text-center">
            <p className="font-medium text-foreground text-sm">
              This tab crashed
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={this.handleRetry}>
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
