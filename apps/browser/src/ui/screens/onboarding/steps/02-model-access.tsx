import type { ReactNode } from 'react';
import { cn } from '@ui/utils';
import {
  IconChevronRightOutline18,
  IconCloudeCodeFillDuo18,
  IconServerFillDuo18,
} from '@stagewise/icons';
import { Logo } from '@stagewise/stage-ui/components/logo';
import { useKartonState } from '@ui/hooks/use-karton';
import { BackButton, OnboardingBottomNav } from '../index';

type BadgeVariant = 'default' | 'primary';

function Badge({
  children,
  variant = 'default',
}: {
  children: ReactNode;
  variant?: BadgeVariant;
}) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border px-2 py-0.5 font-medium text-[10px] leading-none',
        variant === 'primary'
          ? 'border-primary-solid bg-primary-solid text-solid-foreground'
          : 'border-derived bg-surface-2 text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}

type ModelAccessChoice = 'stagewise' | 'existing-subscriptions' | 'custom';

export function StepModelAccess({
  onSelectStagewise,
  onSelectExistingSubscriptions,
  onSelectCustomEndpoints,
  onBack,
}: {
  onSelectStagewise: () => void;
  onSelectExistingSubscriptions: () => void;
  onSelectCustomEndpoints: () => void;
  onBack: () => void;
}) {
  const authStatus = useKartonState((s) => s.userAccount.status);
  const isAuthenticated =
    authStatus === 'authenticated' || authStatus === 'server_unreachable';

  const handleSelect = (choice: ModelAccessChoice) => {
    if (choice === 'stagewise') {
      if (isAuthenticated) {
        onSelectStagewise();
      } else {
        onBack();
      }
    } else if (choice === 'existing-subscriptions') {
      onSelectExistingSubscriptions();
    } else {
      onSelectCustomEndpoints();
    }
  };

  const cards: {
    choice: ModelAccessChoice;
    icon: ReactNode;
    label: string;
    description: string;
    badge?: ReactNode;
  }[] = [
    {
      choice: 'stagewise',
      icon: <Logo className="size-5" pathClassName="text-foreground" />,
      label: 'Use your stagewise account',
      description:
        'Access a wide variety of frontier and open-weight models with one subscription.',
      badge: isAuthenticated ? (
        <Badge variant="primary">Recommended</Badge>
      ) : (
        <Badge>Needs stagewise account</Badge>
      ),
    },
    {
      choice: 'existing-subscriptions',
      icon: <IconCloudeCodeFillDuo18 className="size-5 text-foreground" />,
      label: 'Use existing subscription or API keys',
      description:
        'Continue using your existing subscription with one of the well-known services.',
    },
    {
      choice: 'custom',
      icon: <IconServerFillDuo18 className="size-5 text-foreground" />,
      label: 'Use custom model providers',
      description:
        'Connect a custom model endpoint from the cloud or your local inference setup.',
    },
  ];

  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-semibold text-2xl text-foreground">
            How do you want to access your AI models?
          </h1>
          <p className="max-w-lg text-muted-foreground text-sm">
            You can change this at any time and also use models from multiple
            sources.
          </p>
        </div>
        <div className="flex w-full max-w-lg flex-col gap-3">
          {cards.map((card) => (
            <ModelAccessCard
              key={card.choice}
              icon={card.icon}
              label={card.label}
              description={card.description}
              badge={card.badge}
              onClick={() => handleSelect(card.choice)}
            />
          ))}
        </div>
      </div>
      <OnboardingBottomNav
        left={<BackButton onClick={onBack} />}
        right={null}
      />
    </>
  );
}

function ModelAccessCard({
  icon,
  label,
  description,
  badge,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  badge?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'app-no-drag flex cursor-pointer items-center gap-3 rounded-lg border border-derived bg-surface-1 p-3 text-left transition-colors hover:bg-surface-2',
      )}
    >
      <div className="flex shrink-0 items-center justify-center">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-foreground text-sm">{label}</h3>
          {badge}
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {description}
        </p>
      </div>
      <IconChevronRightOutline18 className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
