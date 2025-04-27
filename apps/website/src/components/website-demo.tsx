'use client';

import { ToggleButton } from './animated-example-popover';

export function WebsiteDemo() {
  return (
    <div className="w-full max-w-4xl rounded-lg border border-gray-200 bg-white shadow-lg">
      {/* Header */}
      <div className='flex items-center justify-between border-gray-200 border-b px-6 py-4'>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-full bg-blue-500" />
          <div className="h-4 w-4 rounded-full bg-green-500" />
          <div className="h-4 w-4 rounded-full bg-yellow-500" />
        </div>
        <div className="flex items-center gap-4">
          <div className="h-4 w-20 rounded bg-gray-100" />
          <div className="h-4 w-4 rounded-full bg-gray-100" />
        </div>
      </div>

      {/* Navigation */}
      <div className='flex items-center gap-6 border-gray-200 border-b px-6 py-3'>
        <div className="h-4 w-16 rounded bg-gray-100" />
        <div className="h-4 w-16 rounded bg-gray-100" />
        <div className="h-4 w-16 rounded bg-gray-100" />
        <div className="h-4 w-16 rounded bg-gray-100" />
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="mb-6">
          <div className="mb-4 h-6 w-48 rounded bg-gray-100" />
          <div className="mb-2 h-4 w-3/4 rounded bg-gray-100" />
          <div className="mb-2 h-4 w-1/2 rounded bg-gray-100" />
          <div className="h-4 w-2/3 rounded bg-gray-100" />
        </div>

        <div className="mb-6 flex items-center gap-4">
          <div className="h-10 w-32 rounded bg-gray-100" />
          <ToggleButton />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="mb-2 h-4 w-24 rounded bg-gray-100" />
            <div className="mb-2 h-4 w-full rounded bg-gray-100" />
            <div className="h-4 w-3/4 rounded bg-gray-100" />
          </div>
          <div className="rounded-lg border border-gray-200 p-4">
            <div className="mb-2 h-4 w-24 rounded bg-gray-100" />
            <div className="mb-2 h-4 w-full rounded bg-gray-100" />
            <div className="h-4 w-3/4 rounded bg-gray-100" />
          </div>
        </div>
      </div>
    </div>
  );
}
