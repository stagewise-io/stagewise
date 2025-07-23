'use client';

import LogoWhite from '@/app/logo-white.svg';
import Image from 'next/image';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function WelcomePage() {
  const router = useRouter();
  const [isSetupLoading, setIsSetupLoading] = useState(false);
  const [isDocsLoading, setIsDocsLoading] = useState(false);

  const handleRedirect = useCallback(() => {
    window.parent.postMessage({ command: 'markGettingStartAsSeen' }, '*');
    router.push('/vscode-extension/setup-finished');
  }, [router]);

  const handleSetupToolbar = useCallback(() => {
    setIsSetupLoading(true);
    window.parent.postMessage({ command: 'setupToolbar' }, '*');
    setTimeout(() => {
      handleRedirect();
    }, 1000);
  }, [handleRedirect]);

  const handleOpenDocs = useCallback(() => {
    setIsDocsLoading(true);
    window.parent.postMessage({ command: 'openDocs' }, '*');
    setTimeout(() => {
      handleRedirect();
    }, 1000);
  }, [handleRedirect]);

  const isAnyButtonLoading = isSetupLoading || isDocsLoading;

  return (
    <main className="flex min-h-screen w-screen flex-col items-center justify-center gap-8 bg-neutral-900 p-8">
      <Image src={LogoWhite} alt="stagewise" className="w-48" />
      <h1 className="font-bold text-4xl text-white">Welcome 🎉</h1>
      <p className="mb-8 text-zinc-400">
        Let's get you started! We'll guide you through the process of setting up
        stagewise in your project.
      </p>

      <div className="grid w-full max-w-4xl grid-cols-1 gap-8 md:grid-cols-2">
        {/* Automated Setup Card */}
        <div
          className={`flex min-h-[320px] animate-pulse-border flex-col rounded-lg border-2 border-blue-500 bg-zinc-800/50 p-8 shadow-lg transition-colors hover:bg-zinc-800 ${
            isAnyButtonLoading ? 'pointer-events-none' : ''
          }`}
        >
          <div className="mb-4 flex items-center gap-2">
            <h2 className="font-bold text-2xl text-white">AI-Assisted Setup</h2>
            <span className="rounded-full bg-blue-500 px-2 py-1 text-white text-xs">
              Recommended
            </span>
          </div>
          <p className="mb-6 flex-grow text-zinc-300">
            Let our AI guide you through the setup process automatically.
          </p>
          <button
            type="button"
            className="relative cursor-pointer rounded-lg bg-blue-500 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
            onClick={handleSetupToolbar}
            disabled={isAnyButtonLoading}
          >
            {isSetupLoading ? (
              <div className="flex items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span className="ml-2">Setting up...</span>
              </div>
            ) : (
              'Setup Automatically'
            )}
          </button>
        </div>

        {/* Manual Setup Card */}
        <div
          className={`flex min-h-[320px] flex-col rounded-lg border border-neutral-700 bg-neutral-800/50 p-8 transition-colors hover:bg-neutral-800/70 ${isAnyButtonLoading ? 'pointer-events-none' : ''}`}
        >
          <h2 className="mb-4 font-bold text-2xl text-white">Manual Setup</h2>
          <div className="flex-grow">
            <p className="mb-2 text-zinc-300">
              Prefer to set up stagewise manually? Follow our step-by-step
              guide.
            </p>
            <p className="text-sm text-zinc-500">
              Use this method, if the automated setup doesn't work for you.
            </p>
          </div>
          <button
            type="button"
            className="relative cursor-pointer rounded-lg bg-zinc-700 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-70"
            onClick={handleOpenDocs}
            disabled={isAnyButtonLoading}
          >
            {isDocsLoading ? (
              <div className="flex items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span className="ml-2">Opening docs...</span>
              </div>
            ) : (
              'Setup Manually'
            )}
          </button>
        </div>
      </div>

      <button
        type="button"
        className="text-sm text-zinc-500 transition-colors hover:text-zinc-400"
        onClick={handleRedirect}
      >
        Skip this step
      </button>

      <style jsx>{`
        @keyframes pulse-border {
          0% { border-color: rgb(59 130 246); }
          50% { border-color: rgb(96 165 250); }
          100% { border-color: rgb(59 130 246); }
        }
        .animate-pulse-border {
          animation: pulse-border 2s ease-in-out infinite;
        }
      `}</style>
    </main>
  );
}
