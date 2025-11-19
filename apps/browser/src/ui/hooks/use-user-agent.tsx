// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

import { useMemo } from 'react';
import bowser from 'bowser';
import { getIFrameWindow } from '@/utils';

const useBrowserInfo = () => {
  const browserInfo = useMemo(() => {
    const iframeWindow = getIFrameWindow();
    const userAgent =
      iframeWindow?.navigator.userAgent || window.navigator.userAgent;

    const result = bowser.parse(userAgent);
    return {
      browser: result.browser,
      engine: result.engine,
      os: result.os,
    };
  }, []);

  return browserInfo;
};

export default useBrowserInfo;
