import { IconGearsFill18 } from 'nucleo-ui-fill-18';
import { ErrorDisplay } from './components/error-display';

export function NotFound() {
  return (
    <main className="flex size-full min-h-screen flex-col items-center justify-center bg-background">
      <ErrorDisplay
        title="Page not found"
        message="The page you are looking for does not exist."
        buttonActions={[
          {
            label: (
              <>
                Open browser settings
                <IconGearsFill18 className="size-4" />
              </>
            ),
            href: 'stagewise://internal/browsing-settings',
          },
          {
            label: 'Close tab',
            onClick: () => {
              window.close();
            },
          },
        ]}
      />
    </main>
  );
}
