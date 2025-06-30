// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

import { useMemo } from 'react';
import bowser from 'bowser';

const useBrowserInfo = () => {
  const browserInfo = useMemo(() => {
    {
      const result = bowser.parse(window.navigator.userAgent);
      return {
        browser: result.browser,
        engine: result.engine,
        os: result.os,
      };
    }
  }, []);

  return browserInfo;
};

export default useBrowserInfo;
