'use client';

import { usePostHog } from 'posthog-js/react';
import { buttonVariants } from '@stagewise/stage-ui/components/button';
import { IconGithub } from 'nucleo-social-media';

interface GithubStarButtonProps {
  starCount: number;
}

export function GithubStarButton({ starCount }: GithubStarButtonProps) {
  const posthog = usePostHog();

  const formatStarCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K+`;
    }
    return count.toString();
  };

  return (
    <a
      href="https://github.com/stagewise-io/stagewise"
      onClick={() => posthog?.capture('hero_github_star_click')}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonVariants({ variant: 'ghost', size: 'lg' })}
    >
      <IconGithub className="size-5" />
      <span className="font-medium text-sm">{formatStarCount(starCount)}</span>
    </a>
  );
}
