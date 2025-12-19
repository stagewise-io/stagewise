import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/history')({
  component: Page,
  head: () => ({
    meta: [
      {
        title: 'History',
      },
    ],
  }),
});

function Page() {
  return <div className="p-2">Hello from History!</div>;
}
