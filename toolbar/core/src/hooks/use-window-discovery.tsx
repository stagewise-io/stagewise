import { useEffect, useState } from 'preact/hooks';
import { discoverVSCodeWindows, type VSCodeWindow } from '../srpc';

export function useWindowDiscovery() {
  const [windows, setWindows] = useState<VSCodeWindow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const discover = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const discoveredWindows = await discoverVSCodeWindows();
      setWindows(discoveredWindows);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to discover windows',
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-discover on mount
  useEffect(() => {
    discover();
  }, []);

  return {
    windows,
    isLoading,
    error,
    discover,
  };
}
