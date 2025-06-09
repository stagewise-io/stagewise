// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'preact/compat';
import type { ComponentChildren } from 'preact';
import { createSRPCClientBridge, type ZodClient } from '@stagewise/srpc/client';
import { contract } from '@stagewise/extension-toolbar-srpc-contract';
import { useVSCode } from './use-vscode';

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

  const { selectedSession, windows } = useVSCode();
  const bridgeRef = useRef<ZodClient<typeof contract> | null>(null);

  const initializeBridge = useCallback(async (port: number) => {
    if (bridgeRef.current) await bridgeRef.current.close();

    try {
      const bridge = createSRPCClientBridge(`ws://localhost:${port}`, contract);
      await bridge.connect();
      bridgeRef.current = bridge;

      setState({
        bridge,
        isConnecting: false,
        error: null,
      });
    } catch (error) {
      bridgeRef.current = null;
      setState({
        bridge: null,
        isConnecting: false,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }, []);

  useEffect(() => {
    if (selectedSession) {
      initializeBridge(selectedSession.port);
    } else if (windows.length > 0) {
      initializeBridge(windows[0].port);
    }
  }, [selectedSession, initializeBridge, windows]);

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
