import { AnimatedGradientBackground } from '@/components/ui/animated-gradient-background';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@stagewise/stage-ui/components/menu';
import { Logo } from '@/components/ui/logo';
import { BookIcon, ExternalLinkIcon, TriangleAlertIcon } from 'lucide-react';
import DiscordLogo from './discord.svg';

export function LogoMenu() {
  return (
    <Menu>
      <MenuTrigger>
        <Button
          size="icon-md"
          variant="secondary"
          className="flex shrink-0 items-center justify-center overflow-hidden rounded-full"
        >
          <AnimatedGradientBackground className="absolute inset-0 z-0 size-full" />
          <Logo
            color="white"
            className="z-10 mr-px mb-px size-1/2 shadow-2xs"
          />
        </Button>
      </MenuTrigger>
      <MenuContent>
        <a href="https://stagewise.io" target="_blank" className="w-full">
          <MenuItem>
            <ExternalLinkIcon className="size-4" />
            Visit stagewise.io
          </MenuItem>
        </a>
        <MenuSeparator orientation="horizontal" />
        <a
          href="https://github.com/stagewise-io/stagewise/issues/new"
          target="_blank"
        >
          <MenuItem>
            <TriangleAlertIcon className="size-4" />
            Report an issue
          </MenuItem>
        </a>
        <a href="https://stagewise.io/docs" target="_blank">
          <MenuItem>
            <BookIcon className="size-4" />
            Read the docs
          </MenuItem>
        </a>
        <a
          href={`${process.env.DISCORD_INVITE_LINK || 'https://discord.gg/gkdGsDYaKA'}`}
          target="_blank"
        >
          <MenuItem>
            <img src={DiscordLogo} alt="Discord" className="size-4" />
            Join the community
          </MenuItem>
        </a>
      </MenuContent>
    </Menu>
  );
}
