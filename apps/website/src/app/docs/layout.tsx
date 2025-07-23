import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { baseOptions } from '@/app/layout.config';
import { source } from '@/lib/source';

export const metadata = {
  title: {
    template: 'stagewise Docs | %s',
    default: 'stagewiseDocs', // a default is required when creating a template
  },
  description: 'Learn how to use Stagewise.',
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      {...baseOptions}
      searchToggle={{ enabled: true }}
    >
      {children}
    </DocsLayout>
  );
}
