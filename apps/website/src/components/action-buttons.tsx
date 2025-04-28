'use client';
import { VscVscode } from 'react-icons/vsc';
import { SiNpm } from 'react-icons/si';

export function ActionButtons() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <a
        href="https://marketplace.visualstudio.com/items?itemName=stagewise.toolbar"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-lg bg-[#007ACC] px-6 py-3 text-white transition-colors hover:bg-[#0062a3]"
      >
        <VscVscode className="h-5 w-5" />
        VS Code Extension
      </a>
      <button
        type="button"
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-6 py-3 text-gray-700 transition-colors hover:bg-gray-50"
        onClick={() => {
          navigator.clipboard.writeText('npm install @stagewise/toolbar');
        }}
      >
        <SiNpm className="h-5 w-5" />
        npm install @stagewise/toolbar
      </button>
    </div>
  );
}
