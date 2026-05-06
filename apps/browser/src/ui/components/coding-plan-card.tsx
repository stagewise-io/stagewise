import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { useIsTruncated } from '@ui/hooks/use-is-truncated';
import { cn } from '@ui/utils';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  CODING_PLANS,
  type CodingPlan,
  type CodingPlanId,
} from '@shared/coding-plans';
import type { ProviderEndpointMode } from '@shared/karton-contracts/ui/shared-types';

export { CODING_PLANS };
export type { CodingPlan, CodingPlanId };

type ConnectResult = { success: true } | { success: false; error: string };

export type CodingPlanCardProps = {
  plan: CodingPlan;
  /** Provider config derived from preferences.providerConfigs[plan.provider]. */
  config: {
    mode: ProviderEndpointMode;
    encryptedApiKey?: string | null;
  };
  /**
   * Validate + store + flip the provider to `official` mode. Callers are
   * expected to mirror the `connectCodingPlan` semantics from the backend.
   */
  onConnect?: (planId: CodingPlanId, apiKey: string) => Promise<ConnectResult>;
  /**
   * Disconnect handler. Only supplied by callers that want a Disconnect
   * button (settings). Onboarding omits this to keep the flow forward-only.
   */
  onDisconnect?: () => Promise<void>;
  /**
   * Open a provider dashboard URL in the system browser / a new tab.
   * When omitted, the helper "(Learn more)" link falls back to a plain
   * `<a target="_blank">` that the host browser handles natively.
   */
  onGetApiKey?: (url: string) => void;
  /** Fired exactly once after a successful connect. */
  onConnected?: () => void;
  /**
   * Hide the internal header (title + tagline) and strip the surrounding
   * border/padding. Useful when the surrounding view already renders its
   * own heading (e.g. the onboarding sub-view).
   */
  hideHeader?: boolean;
  /**
   * Autofocus the API key input when it is editable. Used by the onboarding
   * detail sub-view so users can start typing immediately after opening a
   * plan. Ignored while the card is connected (input is read-only).
   */
  autoFocusInput?: boolean;
};

export function CodingPlanCard({
  plan,
  config,
  onConnect,
  onDisconnect,
  onGetApiKey,
  onConnected,
  hideHeader,
  autoFocusInput,
}: CodingPlanCardProps) {
  const reactId = useId();
  const inputId = `coding-plan-${plan.id}-api-key-${reactId}`;
  const errorId = `${inputId}-error`;

  const isConnected = !!config.encryptedApiKey && config.mode === 'official';

  const [localInput, setLocalInput] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  // Synchronous in-flight guard. React state updates are async, so overlapping
  // handlers (blur + click, Enter + click) within the same event cycle would
  // otherwise each see `isConnecting === false` and double-fire onConnect.
  const connectInFlightRef = useRef(false);
  const disconnectInFlightRef = useRef(false);
  useEffect(
    () => () => {
      connectInFlightRef.current = false;
      disconnectInFlightRef.current = false;
    },
    [],
  );

  const handleInputChange = useCallback((value: string) => {
    setLocalInput(value);
    setLocalError(null);
  }, []);

  const handleConnect = useCallback(async () => {
    if (connectInFlightRef.current) return;
    if (!onConnect) return;
    const key = localInput.trim();
    if (!key) return;
    connectInFlightRef.current = true;
    setIsConnecting(true);
    setLocalError(null);
    try {
      const res = await onConnect(plan.id, key);
      if (res.success) {
        setLocalInput('');
        onConnected?.();
      } else {
        setLocalError(res.error);
      }
    } catch {
      setLocalError('Connection failed. Please try again.');
    } finally {
      connectInFlightRef.current = false;
      setIsConnecting(false);
    }
  }, [localInput, plan.id, onConnect, onConnected]);

  const handleDisconnect = useCallback(async () => {
    if (disconnectInFlightRef.current) return;
    if (!onDisconnect) return;
    disconnectInFlightRef.current = true;
    setIsDisconnecting(true);
    try {
      await onDisconnect();
      setLocalError(null);
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : 'Disconnection failed. Please try again.',
      );
    } finally {
      disconnectInFlightRef.current = false;
      setIsDisconnecting(false);
    }
  }, [onDisconnect]);

  return (
    <div
      className={cn(
        'space-y-3',
        !hideHeader && 'rounded-lg border border-derived p-4',
      )}
    >
      {!hideHeader && (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-1.5 font-medium text-foreground text-sm">
              {plan.displayName}
              {isConnected && (
                <span className="rounded-full border border-border-subtle bg-surface-1 px-1.5 py-[1px] font-medium text-[10px] text-muted-foreground">
                  Connected
                </span>
              )}
            </h3>
            <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
              {plan.tagline}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <div className="flex gap-1.5">
          <label htmlFor={inputId} className="sr-only">
            {`${plan.displayName} API key`}
          </label>
          <Input
            id={inputId}
            autoFocus={autoFocusInput && !isConnected}
            type="password"
            value={isConnected ? '••••••••••••••••' : localInput}
            placeholder="Enter API key..."
            onValueChange={isConnected ? undefined : handleInputChange}
            onKeyDown={(e) => {
              if (isConnected) return;
              if (e.key !== 'Enter') return;
              if (localInput.trim() && !isConnecting) {
                void handleConnect();
              }
            }}
            onBlur={() => {
              if (isConnected) return;
              if (localInput.trim() && !isConnecting) {
                void handleConnect();
              }
            }}
            disabled={isConnecting || isConnected}
            readOnly={isConnected}
            aria-invalid={localError ? true : undefined}
            aria-describedby={localError ? errorId : undefined}
            size="sm"
            style={{ maxWidth: 'none' }}
            className={cn(
              'min-w-0 flex-1',
              localError && 'border-error-foreground',
            )}
          />
          {isConnected && onDisconnect ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          ) : (
            !isConnected &&
            localInput.trim() && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleConnect}
                disabled={isConnecting}
              >
                {isConnecting ? 'Connecting…' : 'Connect'}
              </Button>
            )
          )}
        </div>
        {localError && <TruncatedErrorText id={errorId} text={localError} />}
        {!localError && !isConnected && config.mode === 'custom' && (
          <p className="text-2xs text-subtle-foreground">
            This provider is currently set to Custom. Connecting will switch it
            to Official.
          </p>
        )}
        {!localError &&
          !isConnected &&
          config.mode !== 'custom' &&
          plan.helpText && (
            <p className="text-subtle-foreground text-xs">
              <span className="inline-flex items-center gap-0">
                {plan.helpText}
                <Tooltip>
                  <TooltipTrigger>
                    <a
                      href={plan.apiKeyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        if (onGetApiKey) {
                          e.preventDefault();
                          onGetApiKey(plan.apiKeyUrl);
                        }
                      }}
                      className={cn(
                        buttonVariants({ variant: 'link', size: 'xs' }),
                        'shrink-0',
                      )}
                    >
                      Create key
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>{plan.apiKeyUrl}</TooltipContent>
                </Tooltip>
              </span>
            </p>
          )}
      </div>
    </div>
  );
}

function TruncatedErrorText({ id, text }: { id?: string; text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { isTruncated, tooltipOpen, setTooltipOpen } = useIsTruncated(ref);

  return (
    <Tooltip open={isTruncated && tooltipOpen} onOpenChange={setTooltipOpen}>
      <TooltipTrigger>
        <p
          id={id}
          ref={ref}
          role="alert"
          className={cn('truncate text-2xs text-error-foreground')}
        >
          {text}
        </p>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start">
        <div className="wrap-break-word line-clamp-12 max-h-48 max-w-xs overflow-y-auto text-2xs leading-relaxed">
          {text}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
