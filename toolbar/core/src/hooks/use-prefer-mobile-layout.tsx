// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

import { useMediaQuery } from '@/hooks/use-media-query';

export const usePreferMobileLayout = () => useMediaQuery('(max-width: 768px)');
