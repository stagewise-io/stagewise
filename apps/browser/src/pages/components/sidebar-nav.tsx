import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@stagewise/stage-ui/components/button';
import { cn } from '@ui/utils';
import type { ReactNode } from 'react';

interface SidebarNavItemProps {
  to: string;
  icon: ReactNode;
  children: ReactNode;
}

function SidebarNavItem({ to, icon, children }: SidebarNavItemProps) {
  return (
    <Link
      to={to}
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'md' }),
        'w-full justify-start gap-3 font-normal',
        'data-[active=true]:bg-accent/80',
      )}
      activeProps={{
        'data-active': 'true',
      }}
      activeOptions={{ exact: true }}
    >
      {icon}
      {children}
    </Link>
  );
}

interface SidebarNavGroupProps {
  label: string;
  children: ReactNode;
}

function SidebarNavGroup({ label, children }: SidebarNavGroupProps) {
  return (
    <div className="flex w-full flex-col items-stretch justify-start gap-2">
      <span className="ml-1 text-muted-foreground text-sm">{label}</span>
      {children}
    </div>
  );
}

interface SidebarNavProps {
  children: ReactNode;
}

export function SidebarNav({ children }: SidebarNavProps) {
  return (
    <div className="mt-6 mb-6 flex w-full flex-col items-stretch justify-start gap-6">
      {children}
    </div>
  );
}

SidebarNav.Item = SidebarNavItem;
SidebarNav.Group = SidebarNavGroup;
