import { createFileRoute } from '@tanstack/react-router';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { useKartonState, useKartonProcedure } from '@pages/hooks/use-karton';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@pages/utils';
import { Switch } from '@stagewise/stage-ui/components/switch';
import { Input } from '@stagewise/stage-ui/components/input';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import { produceWithPatches, enablePatches } from 'immer';
import type { PluginDefinition } from '@shared/plugins';
import {
  credentialTypeRegistry,
  extractSecretFieldNames,
} from '@shared/credential-types';
import type { CredentialTypeId } from '@shared/credential-types';
import type { z } from 'zod';
import {
  IconPuzzlePieceOutline18,
  IconChevronRightOutline18,
  IconChevronLeftOutline18,
} from 'nucleo-ui-outline-18';

enablePatches();

export const Route = createFileRoute('/_internal-app/agent-settings/plugins')({
  component: Page,
  head: () => ({
    meta: [
      {
        title: 'Plugins',
      },
    ],
  }),
});

function PluginIcon({
  logoSvg,
  className = 'size-7',
}: {
  logoSvg: string | null;
  className?: string;
}) {
  if (logoSvg) {
    return (
      <div
        className={cn(
          className,
          'overflow-hidden text-foreground [&>svg]:size-full',
        )}
        dangerouslySetInnerHTML={{ __html: logoSvg }}
      />
    );
  }
  return <IconPuzzlePieceOutline18 className={className} />;
}

function PluginCard({
  plugin,
  isEnabled,
  onOpenDetails,
}: {
  plugin: PluginDefinition;
  isEnabled: boolean;
  onOpenDetails: () => void;
}) {
  const pluginMetaText = useMemo(() => {
    let text = '';
    if (plugin.skills.length > 0)
      text += `${plugin.skills.length} ${plugin.skills.length === 1 ? 'skill' : 'skills'}`;

    if (plugin.requiredCredentials?.length > 0) {
      if (text.length > 0) text += ', ';
      text += 'credentials';
    }

    return text;
  }, [plugin.requiredCredentials, plugin.skills]);
  return (
    <div
      className={cn(
        'flex h-17 cursor-pointer flex-col rounded-lg border border-derived bg-surface-1 p-3 lg:h-20',
        !isEnabled && 'opacity-80',
      )}
      onClick={onOpenDetails}
    >
      <div className="flex h-full items-start justify-between gap-3">
        <div className="flex h-full min-w-0 flex-1 items-center gap-4">
          <div className="mt-0.5 flex shrink-0 items-center justify-center">
            <PluginIcon logoSvg={plugin.logoSvg} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-foreground text-sm">
                {plugin.displayName}
              </h3>
              <span className="rounded-full text-subtle-foreground text-xs">
                {pluginMetaText}
              </span>
            </div>
            <p className="mt-0.5 line-clamp-1 text-muted-foreground text-xs lg:line-clamp-2">
              {plugin.description}
            </p>
          </div>
        </div>
        <div
          className="flex shrink-0 items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <IconChevronRightOutline18 className="size-3.5 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

function CredentialFieldCard({
  typeId,
  isConfigured,
  onSave,
  onDelete,
}: {
  typeId: CredentialTypeId;
  isConfigured: boolean;
  onSave: (typeId: string, data: Record<string, string>) => Promise<void>;
  onDelete: (typeId: string) => Promise<void>;
}) {
  const typeDef = credentialTypeRegistry[typeId];
  if (!typeDef) return null;

  const secretFields = extractSecretFieldNames(
    typeDef.schema as z.ZodObject<z.ZodRawShape>,
  );
  if (secretFields.length === 0) return null;

  return (
    <div className="space-y-3 rounded-lg border border-derived p-4">
      <div>
        <h3 className="font-medium text-foreground text-sm">
          {typeDef.displayName}
        </h3>
        <p className="mt-0.5 text-muted-foreground text-xs">
          {typeDef.description}
        </p>
      </div>

      {secretFields.map((field) => (
        <CredentialFieldInput
          key={field}
          typeId={typeId}
          field={field}
          metadata={
            typeDef.fieldMetadata[field as keyof typeof typeDef.fieldMetadata]
          }
          isConfigured={isConfigured}
          onSave={onSave}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function CredentialFieldInput({
  typeId,
  field,
  metadata,
  isConfigured,
  onSave,
  onDelete,
}: {
  typeId: string;
  field: string;
  metadata?: { description: string; helpText?: string; helpUrl?: string };
  isConfigured: boolean;
  onSave: (typeId: string, data: Record<string, string>) => Promise<void>;
  onDelete: (typeId: string) => Promise<void>;
}) {
  const DOTS = '\u2022'.repeat(32);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const showDots = isConfigured && !inputValue;

  useEffect(() => {
    if (saved) {
      const timer = setTimeout(() => setSaved(false), 2_000);
      return () => clearTimeout(timer);
    }
  }, [saved]);

  const handleSave = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setIsSaving(true);
    try {
      await onSave(typeId, { [field]: trimmed });
      setInputValue('');
      setSaved(true);
    } finally {
      setIsSaving(false);
    }
  }, [inputValue, typeId, field, onSave]);

  const handleDelete = useCallback(async () => {
    await onDelete(typeId);
    setSaved(false);
  }, [typeId, onDelete]);

  const label = metadata?.description ?? field;

  return (
    <div className="space-y-1">
      <div className="flex gap-1.5">
        <Input
          ref={inputRef}
          type="password"
          value={showDots ? DOTS : inputValue}
          placeholder={
            isConfigured ? undefined : `Enter ${label.toLowerCase()}...`
          }
          onValueChange={(v) => {
            const newValue = v.replaceAll('\u2022', '');
            setInputValue(newValue);
            setSaved(false);
          }}
          onFocus={() => {
            if (showDots) {
              requestAnimationFrame(() => inputRef.current?.select());
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && inputValue.trim()) {
              void handleSave();
            }
          }}
          onBlur={() => {
            if (inputValue.trim()) {
              void handleSave();
            }
          }}
          disabled={isSaving}
          size="sm"
          style={{ maxWidth: 'none' }}
          className="min-w-0 flex-1"
        />
        {inputValue ? (
          <Button
            variant="primary"
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void handleSave()}
            disabled={isSaving}
          >
            Save
          </Button>
        ) : isConfigured ? (
          <Button variant="ghost" size="sm" onClick={handleDelete}>
            Clear
          </Button>
        ) : null}
      </div>
      {metadata?.helpText && (
        <p className="text-subtle-foreground text-xs">
          {metadata.helpUrl ? (
            <div className="flex items-center gap-0">
              {metadata.helpText}
              <Tooltip>
                <TooltipTrigger>
                  <a
                    href={metadata.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      buttonVariants({ variant: 'link', size: 'xs' }),
                    )}
                  >
                    (Learn more)
                  </a>
                </TooltipTrigger>
                <TooltipContent>{metadata.helpUrl}</TooltipContent>
              </Tooltip>
            </div>
          ) : (
            metadata.helpText
          )}
        </p>
      )}
    </div>
  );
}

function PluginDetailView({
  plugin,
  isEnabled,
  onToggle,
  onBack,
  configuredCredentialIds,
  setCredential,
  deleteCredential,
}: {
  plugin: PluginDefinition;
  isEnabled: boolean;
  onToggle: () => void;
  onBack: () => void;
  configuredCredentialIds: string[];
  setCredential: (
    typeId: string,
    data: Record<string, string>,
  ) => Promise<void>;
  deleteCredential: (typeId: string) => Promise<void>;
}) {
  const userVisibleCredentials = useMemo(
    () => plugin.requiredCredentials.filter((id) => id !== 'stagewise-auth'),
    [plugin.requiredCredentials],
  );

  const pluginMetaText = useMemo(() => {
    const parts: string[] = [];
    if (plugin.skills.length > 0)
      parts.push(
        `${plugin.skills.length} ${plugin.skills.length === 1 ? 'skill' : 'skills'}`,
      );
    if (userVisibleCredentials.length > 0)
      parts.push(
        `${userVisibleCredentials.length} ${userVisibleCredentials.length === 1 ? 'credential' : 'credentials'}`,
      );
    return parts.join(', ');
  }, [plugin.skills, userVisibleCredentials]);

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex items-center border-border-subtle border-b px-6 py-4">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon-sm" onClick={onBack}>
              <IconChevronLeftOutline18 className="size-4" />
            </Button>
            <h1 className="font-semibold text-foreground text-xl">
              {plugin.displayName}
            </h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <OverlayScrollbar className="flex-1" contentClassName="px-6 pt-6 pb-24">
        <div className="mx-auto max-w-3xl space-y-8">
          {/* Plugin info */}
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              <PluginIcon logoSvg={plugin.logoSvg} className="size-10" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-1">
                <label
                  htmlFor="plugin-toggle"
                  className="-mt-1 text-muted-foreground text-sm"
                >
                  {plugin.description}
                </label>
                <Switch
                  id="plugin-toggle"
                  checked={isEnabled}
                  onCheckedChange={() => onToggle()}
                  size="sm"
                  className="shrink-0"
                />
              </div>
              {pluginMetaText && (
                <p className="mt-1.5 text-subtle-foreground text-xs">
                  {pluginMetaText}
                </p>
              )}
            </div>
          </div>

          {/* Credentials section */}
          {userVisibleCredentials.length > 0 && (
            <section className="space-y-4">
              <div className="space-y-3">
                {userVisibleCredentials.map((typeId) => (
                  <CredentialFieldCard
                    key={typeId}
                    typeId={typeId as CredentialTypeId}
                    isConfigured={configuredCredentialIds.includes(typeId)}
                    onSave={setCredential}
                    onDelete={deleteCredential}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </OverlayScrollbar>
    </div>
  );
}

function Page() {
  const preferences = useKartonState((s) => s.preferences);
  const updatePreferences = useKartonProcedure((s) => s.updatePreferences);
  const configuredCredentialIds = useKartonState(
    (s) => s.configuredCredentialIds,
  );
  const setCredential = useKartonProcedure((s) => s.setCredential);
  const deleteCredential = useKartonProcedure((s) => s.deleteCredential);

  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);

  const disabledPluginIds = useMemo(
    () => new Set(preferences?.agent.disabledPluginIds ?? []),
    [preferences?.agent.disabledPluginIds],
  );

  const plugins = useKartonState((s) => s.plugins);

  const enabledPlugins = useMemo(() => {
    return plugins.filter((plugin) => !disabledPluginIds.has(plugin.id));
  }, [plugins, disabledPluginIds]);

  const disabledPlugins = useMemo(() => {
    return plugins.filter((plugin) => disabledPluginIds.has(plugin.id));
  }, [plugins, disabledPluginIds]);

  const handleTogglePlugin = useCallback(
    async (pluginId: string) => {
      const [, patches] = produceWithPatches(preferences, (draft) => {
        const idx = draft.agent.disabledPluginIds.indexOf(pluginId);
        if (idx === -1) {
          draft.agent.disabledPluginIds.push(pluginId);
        } else {
          draft.agent.disabledPluginIds.splice(idx, 1);
        }
      });
      await updatePreferences(patches);
    },
    [preferences, updatePreferences],
  );

  const selectedPlugin = useMemo(
    () => plugins.find((p) => p.id === selectedPluginId) ?? null,
    [plugins, selectedPluginId],
  );

  if (selectedPlugin) {
    return (
      <PluginDetailView
        plugin={selectedPlugin}
        isEnabled={!disabledPluginIds.has(selectedPlugin.id)}
        onToggle={() => handleTogglePlugin(selectedPlugin.id)}
        onBack={() => setSelectedPluginId(null)}
        configuredCredentialIds={configuredCredentialIds}
        setCredential={setCredential}
        deleteCredential={deleteCredential}
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex items-center border-border-subtle border-b px-6 py-4">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="font-semibold text-foreground text-xl">Plugins</h1>
          <p className="text-muted-foreground text-sm">
            Enable or disable plugins to extend the agent's capabilities with
            additional skills.
          </p>
        </div>
      </div>

      {/* Content */}
      <OverlayScrollbar className="flex-1" contentClassName="px-6 pt-6 pb-24">
        <div className="mx-auto max-w-3xl">
          {enabledPlugins.length > 0 && (
            <>
              <div className="pb-1.5 text-muted-foreground text-xs">
                Enabled
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {enabledPlugins.map((plugin) => (
                  <PluginCard
                    key={plugin.id}
                    plugin={plugin}
                    isEnabled={!disabledPluginIds.has(plugin.id)}
                    onOpenDetails={() => setSelectedPluginId(plugin.id)}
                  />
                ))}
              </div>
            </>
          )}
          {disabledPlugins.length > 0 && (
            <>
              <div className="mt-6 pb-1.5 text-subtle-foreground text-xs">
                Disabled
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {disabledPlugins.map((plugin) => (
                  <PluginCard
                    key={plugin.id}
                    plugin={plugin}
                    isEnabled={false}
                    onOpenDetails={() => setSelectedPluginId(plugin.id)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </OverlayScrollbar>
    </div>
  );
}
