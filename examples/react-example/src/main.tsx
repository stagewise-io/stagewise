import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { StagewiseToolbar } from '@stagewise/toolbar-react';

// Render the main app
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StagewiseToolbar
      config={{
        plugins: [],
        server: {
          protocol: 'auto', // or 'https' for HTTPS-only
        },
      }}
    />
    <App />
  </StrictMode>,
);
