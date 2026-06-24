import { cn } from '@ui/utils';
import { IconChevronRightOutline18 } from 'nucleo-ui-outline-18';
import { useKartonState } from '@ui/hooks/use-karton';
import { BackButton, OnboardingBottomNav } from '../index';

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
    label: string;
    description: string;
  }[] = [
    {
      choice: 'stagewise',
      label: 'Use stagewise Account',
      description:
        'Use stagewise Cloud Inference to get easy access to a huge model library through one account.',
    },
    {
      choice: 'existing-subscriptions',
      label: 'Use existing subscriptions',
      description:
        'Configure any of your existing coding plans or API keys for well known inference providers.',
    },
    {
      choice: 'custom',
      label: 'Custom endpoints & models',
      description:
        'Configure new endpoints, no matter if they\u2019re in the cloud, specific to your organization or even local inference.',
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
              label={card.label}
              description={card.description}
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
  label,
  description,
  onClick,
}: {
  label: string;
  description: string;
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
      <div className="min-w-0 flex-1">
        <h3 className="font-medium text-foreground text-sm">{label}</h3>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {description}
        </p>
      </div>
      <IconChevronRightOutline18 className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
