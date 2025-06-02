import { MetaProvider, Title } from '@solidjs/meta';
import { Router } from '@solidjs/router';
import { FileRoutes } from '@solidjs/start/router';
import { Suspense, onMount } from 'solid-js';
import './app.css';

let toolbarInitialized = false;

export default function App() {
  onMount(() => {
    if (import.meta.env.DEV && !toolbarInitialized) {
      setTimeout(() => {
        import('@stagewise/toolbar').then(({ initToolbar }) => {
          initToolbar({ plugins: [] });
          toolbarInitialized = true;
        });
      }, 0); // Defer to next event loop, after hydration
    }
  });

  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <Title>SolidStart - Basic</Title>
          <a href="/">Index</a>
          <a href="/about">About</a>
          <Suspense>{props.children}</Suspense>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
