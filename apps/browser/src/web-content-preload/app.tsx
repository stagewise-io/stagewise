import { Providers } from './providers';
import { HoveredElementTracker } from './components/hovered-element-tracker';
import { KeydownTunnel } from './hooks/keydown-tunnel';

export const App = () => {
  return (
    <Providers>
      <div
        style={{
          fontFamily: "'Geist', sans-serif",
          width: '100vw',
          height: '100vh',
          inset: '0px',
          position: 'fixed',
          pointerEvents: 'none',
          zIndex: '2147483647',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        <HoveredElementTracker />
        <KeydownTunnel />
      </div>
    </Providers>
  );
};
