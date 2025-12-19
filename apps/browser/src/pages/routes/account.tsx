import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/account')({
  component: Page,
  head: () => ({
    meta: [
      {
        title: 'Account',
      },
    ],
  }),
});

function Page() {
  return <div className="p-2">Hello from Account!</div>;
}
