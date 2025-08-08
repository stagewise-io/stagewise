import { useCallback, useEffect, useState } from 'react';
import { useEventListener } from './use-event-listener.js';

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
