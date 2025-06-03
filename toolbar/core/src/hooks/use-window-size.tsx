// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

import { useCallback, useState } from 'preact/hooks';
import { useEventListener } from './use-event-listener';

export interface WindowSize {
  width: number;
  height: number;
}

export function useWindowSize() {
  const [size, setSize] = useState<WindowSize>({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const handleResize = useCallback(
    () =>
      setSize({
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    [],
  );

  useEventListener('resize', handleResize);

  return size;
}
