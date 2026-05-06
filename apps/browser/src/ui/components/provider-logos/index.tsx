import type { ComponentType, SVGProps } from 'react';
import type { ModelProvider } from '@shared/karton-contracts/ui/shared-types';
import { AlibabaLogo } from './alibaba';
import { AnthropicLogo } from './anthropic';
import { DeepSeekLogo } from './deepseek';
import { GoogleLogo } from './google';
import { MinimaxLogo } from './minimax';
import { MoonshotAiLogo } from './moonshotai';
import { OpenAiLogo } from './openai';
import { ZAiLogo } from './z-ai';

export type ProviderLogoComponent = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Brand marks for every built-in `ModelProvider`.
 *
 * Each logo is a React component whose SVG uses `currentColor`, so it inherits
 * the nearest `text-*` class. Sourced from @lobehub/icons-static-svg (MIT).
 */
export const PROVIDER_LOGOS: Record<ModelProvider, ProviderLogoComponent> = {
  anthropic: AnthropicLogo,
  openai: OpenAiLogo,
  google: GoogleLogo,
  moonshotai: MoonshotAiLogo,
  alibaba: AlibabaLogo,
  deepseek: DeepSeekLogo,
  'z-ai': ZAiLogo,
  minimax: MinimaxLogo,
};

/**
 * Renders the brand mark for a given `ModelProvider`. Forwards every
 * `SVGProps` so callers can pass `className`, `aria-label`, etc.
 */
export function ProviderLogo({
  provider,
  ...rest
}: { provider: ModelProvider } & SVGProps<SVGSVGElement>) {
  const Logo = PROVIDER_LOGOS[provider];
  return <Logo {...rest} />;
}

export {
  AlibabaLogo,
  AnthropicLogo,
  DeepSeekLogo,
  GoogleLogo,
  MinimaxLogo,
  MoonshotAiLogo,
  OpenAiLogo,
  ZAiLogo,
};
