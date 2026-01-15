import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_internal-app/browsing-settings')({
  component: () => <Outlet />,
});
