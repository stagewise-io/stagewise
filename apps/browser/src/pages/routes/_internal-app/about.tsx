import { createFileRoute } from '@tanstack/react-router';
import { useKartonState } from '@/hooks/use-karton';

export const Route = createFileRoute('/_internal-app/about')({
  component: Page,
  head: () => ({
    meta: [
      {
        title: 'About',
      },
    ],
  }),
});

function Page() {
  const appInfo = useKartonState((s) => s.appInfo);

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex flex-col items-center border-border/30 border-b px-6 py-4">
        <div className="w-full max-w-3xl">
          <h1 className="font-semibold text-foreground text-xl">About</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex w-full flex-1 flex-col items-center overflow-y-auto p-6">
        <div className="flex w-full max-w-3xl shrink-0 flex-col gap-8">
          {/* App Name Section */}
          <div className="flex flex-col gap-2">
            <h2 className="font-bold text-3xl text-foreground">
              {appInfo.name}
            </h2>
            <div className="flex flex-col gap-1">
              <p className="text-lg text-muted-foreground">
                {appInfo.baseName}
              </p>
              <p className="text-lg text-muted-foreground">
                Version {appInfo.version}
              </p>
            </div>
          </div>

          {/* Divider */}
          <hr className="border-border/30" />

          {/* Details Section */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-y-3">
              <div className="grid grid-cols-[140px_1fr] gap-x-4">
                <span className="font-medium text-muted-foreground text-sm">
                  Bundle ID
                </span>
                <span className="break-all text-foreground text-sm">
                  {appInfo.bundleId}
                </span>
              </div>

              <div className="grid grid-cols-[140px_1fr] gap-x-4">
                <span className="font-medium text-muted-foreground text-sm">
                  Release Channel
                </span>
                <span className="text-foreground text-sm capitalize">
                  {appInfo.releaseChannel}
                </span>
              </div>

              <div className="grid grid-cols-[140px_1fr] gap-x-4">
                <span className="font-medium text-muted-foreground text-sm">
                  Platform
                </span>
                <span className="text-foreground text-sm capitalize">
                  {appInfo.platform}
                </span>
              </div>

              <div className="grid grid-cols-[140px_1fr] gap-x-4">
                <span className="font-medium text-muted-foreground text-sm">
                  Architecture
                </span>
                <span className="text-foreground text-sm">{appInfo.arch}</span>
              </div>

              <div className="grid grid-cols-[140px_1fr] gap-x-4">
                <span className="font-medium text-muted-foreground text-sm">
                  Author
                </span>
                <span className="text-foreground text-sm">
                  {appInfo.author}
                </span>
              </div>

              <div className="grid grid-cols-[140px_1fr] gap-x-4">
                <span className="font-medium text-muted-foreground text-sm">
                  Copyright
                </span>
                <span className="text-foreground text-sm">
                  {appInfo.copyright}
                </span>
              </div>

              <div className="grid grid-cols-[140px_1fr] gap-x-4">
                <span className="font-medium text-muted-foreground text-sm">
                  Homepage
                </span>
                <a
                  href={appInfo.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-blue-600 text-sm hover:underline dark:text-blue-400"
                >
                  {appInfo.homepage}
                </a>
              </div>

              <div className="grid grid-cols-[140px_1fr] gap-x-4">
                <span className="font-medium text-muted-foreground text-sm">
                  Other Versions
                </span>
                <div className="text-foreground text-sm">
                  {Object.entries(appInfo.otherVersions).map(([key, value]) => (
                    <div key={key}>
                      {key}: {value ?? 'N/A'}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
