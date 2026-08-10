import {
  IconFolderCloudOutline18,
  IconServerOutline18,
  IconTerminalOutline18,
} from '@stagewise/icons';
import { Logo } from '@stagewise/stage-ui/components/logo';
import { CODING_PLANS, type CodingPlanId } from '@shared/coding-plans';
import {
  isCodexProviderType,
  type ModelProvider,
  type ProviderInstance,
  type ProviderInstanceTypeId,
} from '@shared/karton-contracts/ui/shared-types';
import { cn } from '@ui/utils';
import { ProviderLogo } from './provider-logos';
import { OllamaLogo } from './provider-logos/ollama';
import { OpenRouterLogo } from './provider-logos/openrouter';

export function ProviderInstanceLogo({
  typeId,
  instance,
  className,
}: {
  typeId: ProviderInstanceTypeId;
  instance?: ProviderInstance;
  className?: string;
}) {
  const vendor: ModelProvider | undefined = typeId.endsWith('-api')
    ? (typeId.slice(0, -4) as ModelProvider)
    : isCodexProviderType(typeId)
      ? 'openai'
      : typeId === 'claude-code'
        ? 'anthropic'
        : undefined;
  if (vendor) {
    return <ProviderLogo provider={vendor} className={className} />;
  }
  if (typeId === 'stagewise') {
    return <Logo className={className} />;
  }
  if (typeId === 'opencode') {
    return <IconTerminalOutline18 className={className} />;
  }
  if (typeId === 'coding-plan') {
    const planId = (instance?.config as { planId?: string })?.planId as
      | CodingPlanId
      | undefined;
    const plan = planId ? CODING_PLANS[planId] : undefined;
    if (plan) {
      return <ProviderLogo provider={plan.provider} className={className} />;
    }
    return (
      <IconServerOutline18 className={cn(className, 'text-muted-foreground')} />
    );
  }
  if (typeId === 'ollama') {
    return <OllamaLogo className={className} />;
  }
  if (typeId === 'openrouter') {
    return <OpenRouterLogo className={className} />;
  }
  return (
    <IconFolderCloudOutline18
      className={cn(className, 'text-muted-foreground')}
    />
  );
}
