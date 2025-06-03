// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

import { useMemo } from 'preact/hooks';
import { UAParser } from 'ua-parser-js';

const useBrowserInfo = () => {
  const browserInfo = useMemo(() => {
    {
      const parser = new (UAParser as any)();
      const result = parser.getResult();
      return {
        browser: result.browser,
        engine: result.engine,
        os: result.os,
        device: result.device,
        cpu: result.cpu,
      };
    }
  }, []);

  return browserInfo;
};

export default useBrowserInfo;
