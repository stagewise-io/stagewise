import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/browsing-settings')({
  component: Page,
  head: () => ({
    meta: [
      {
        title: 'Browsing Settings',
      },
    ],
  }),
});

function Page() {
  return <div className="p-2">Hello from Browsing Settings!</div>;
}
