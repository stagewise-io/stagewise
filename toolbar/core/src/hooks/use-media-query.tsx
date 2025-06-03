import { useCallback, useEffect, useState } from 'preact/hooks';
import { useEventListener } from './use-event-listener';

export const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(false);

  const queryBrowser = useCallback(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }
  }, [matches, query]);

  useEventListener('resize', queryBrowser);

  useEffect(() => {
    queryBrowser();
  }, [queryBrowser]);

  return matches;
};
