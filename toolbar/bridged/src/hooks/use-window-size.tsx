// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

import { useCallback, useEffect, useState } from 'react';
import { getIFrameWindow } from '@/utils';

export interface WindowSize {
  width: number;
  height: number;
}

export function useWindowSize() {
  const iframeWindow = getIFrameWindow();

  const [size, setSize] = useState<WindowSize>({
    width: iframeWindow?.innerWidth || window.innerWidth,
    height: iframeWindow?.innerHeight || window.innerHeight,
  });

  const handleResize = useCallback(() => {
    const iframe = getIFrameWindow();
    if (iframe) {
      setSize({
        width: iframe.innerWidth,
        height: iframe.innerHeight,
      });
    }
  }, []);

  useEffect(() => {
    const iframe = getIFrameWindow();
    if (!iframe) return;

    iframe.addEventListener('resize', handleResize);
    // Initial update
    handleResize();

    return () => {
      iframe.removeEventListener('resize', handleResize);
    };
  }, [handleResize]);

  return size;
}
