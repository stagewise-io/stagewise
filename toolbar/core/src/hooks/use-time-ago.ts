// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';
import { useMemo, useRef } from 'preact/hooks';

TimeAgo.addDefaultLocale(en);

export function useTimeAgo(date: Date) {
  const timeAgoRef = useRef(new TimeAgo('en-US'));

  const timeAgoString = useMemo(() => timeAgoRef.current.format(date), [date]);

  return timeAgoString;
}
