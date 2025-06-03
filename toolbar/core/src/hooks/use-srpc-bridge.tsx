// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

import { createContext, useContext, useEffect, useState } from 'preact/compat';
import type { ComponentChildren } from 'preact';
import { createSRPCClientBridge, type ZodClient } from '@stagewise/srpc/client';
import { contract } from '@stagewise/extension-toolbar-srpc-contract';
import { findPort } from '../srpc';

interface SRPCBridgeContextValue {
  bridge: ZodClient<typeof contract> | null;
  isConnecting: boolean;
  error: Error | null;
}

const SRPCBridgeContext = createContext<SRPCBridgeContextValue>({
  bridge: null,
  isConnecting: false,
  error: null,
});

export function SRPCBridgeProvider({
  children,
}: { children: ComponentChildren }) {
  const [state, setState] = useState<SRPCBridgeContextValue>({
    bridge: null,
    isConnecting: true,
    error: null,
  });

  useEffect(() => {
    async function initializeBridge() {
      try {
        const port = await findPort();
        const bridge = createSRPCClientBridge(
          `ws://localhost:${port}`,
          contract,
        );
        await bridge.connect();
        setState({
          bridge,
          isConnecting: false,
          error: null,
        });
      } catch (error) {
        setState({
          bridge: null,
          isConnecting: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    initializeBridge();
  }, []);

  return (
    <SRPCBridgeContext.Provider value={state}>
      {children}
    </SRPCBridgeContext.Provider>
  );
}

export function useSRPCBridge() {
  const context = useContext(SRPCBridgeContext);
  if (!context) {
    throw new Error('useSRPCBridge must be used within an SRPCBridgeProvider');
  }
  return context;
}
