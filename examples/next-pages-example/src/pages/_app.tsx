import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { StagewiseToolbar } from '@stagewise/toolbar-next';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <StagewiseToolbar />
      <Component {...pageProps} />
    </>
  );
}
