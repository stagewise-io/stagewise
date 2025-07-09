'use client';

import Link from 'next/link';
import { Button } from '@stagewise/ui/components/button';
import { UserMenu } from './user-menu';

interface AuthButtonProps {
  user: { email: string } | null;
}

export function AuthButton({ user }: AuthButtonProps) {
  if (user) {
    return <UserMenu email={user.email} />;
  }

  return (
    <Link href="/signin">
      <Button variant="ghost" size="sm" className="h-9 cursor-pointer px-3">
        Sign in
      </Button>
    </Link>
  );
}
