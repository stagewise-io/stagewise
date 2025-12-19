import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/clear-data')({
  component: Page,
  head: () => ({
    meta: [
      {
        title: 'Clear Data',
      },
    ],
  }),
});

function Page() {
  return <div className="p-2">Hello from Clear Data!</div>;
}
