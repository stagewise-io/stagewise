import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/agent-settings')({
  component: Page,
  head: () => ({
    meta: [
      {
        title: 'Agent Settings',
      },
    ],
  }),
});

function Page() {
  return <div className="p-2">Hello from Agent Settings!</div>;
}
