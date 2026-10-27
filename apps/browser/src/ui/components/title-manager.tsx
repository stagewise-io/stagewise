import { useEffect } from 'react';

export function TitleManager() {
  useEffect(() => {
    document.title = 'stagewise';
  }, []);

  return null;
}
