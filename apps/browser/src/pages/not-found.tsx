import { ErrorDisplay } from './components/error-display';

export function NotFound() {
  return (
    <main className="flex size-full min-h-screen flex-col items-center justify-center bg-background">
      <ErrorDisplay
        title="Page not found"
        message="The page you are looking for does not exist."
        buttonActions={[
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
