'use client';

import { useState, useEffect } from 'react';
import { usePostHog } from 'posthog-js/react';
import { buttonVariants } from '@stagewise/stage-ui/components/button';
import { IconGithub } from 'nucleo-social-media';

export function GithubStarButton() {
  const posthog = usePostHog();
  const [starCount, setStarCount] = useState<number | null>(null);

  useEffect(() => {
    const fetchStarCount = async () => {
      try {
        const response = await fetch(
          'https://api.github.com/repos/stagewise-io/stagewise',
        );
        if (response.ok) {
          const data = await response.json();
          setStarCount(data.stargazers_count);
        }
      } catch {
        setStarCount(4300);
      }
    };

    fetchStarCount();
  }, []);

  const formatStarCount = (count: number | null) => {
    if (count === null) return '3K+';
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
