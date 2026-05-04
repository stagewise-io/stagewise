import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { useKartonState, useKartonProcedure } from '@pages/hooks/use-karton';
import { useTrack } from '@pages/hooks/use-track';
import { useEffect, useRef, useState, useCallback } from 'react';

import type {
  ApiSpec,
  CustomEndpoint,
} from '@shared/karton-contracts/ui/shared-types';
import { Input } from '@stagewise/stage-ui/components/input';
import { Button } from '@stagewise/stage-ui/components/button';
import { Select } from '@stagewise/stage-ui/components/select';
import { Switch } from '@stagewise/stage-ui/components/switch';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogHeader,
  DialogFooter,
} from '@stagewise/stage-ui/components/dialog';
import { produceWithPatches, enablePatches } from 'immer';
import {
  IconPlusOutline18,
  IconPenOutline18,
  IconTrashOutline18,
  IconChevronLeftOutline18,
} from 'nucleo-ui-outline-18';

enablePatches();

export const Route = createFileRoute(
  '/_internal-app/agent-settings/custom-providers',
)({
  component: Page,
  head: () => ({
    meta: [
      {
        title: 'Custom Providers',
      },
    ],
  }),
});

// =============================================================================
// Custom Endpoint Components
// =============================================================================

const API_SPEC_OPTIONS: { value: ApiSpec; label: string; group: string }[] = [
  {
    value: 'openai-chat-completions',
    label: 'OpenAI (Chat Completions)',
    group: 'Generic',
  },
  { value: 'openai-responses', label: 'OpenAI (Responses)', group: 'Generic' },
  { value: 'anthropic', label: 'Anthropic', group: 'Generic' },
  { value: 'google', label: 'Google', group: 'Generic' },
  { value: 'azure', label: 'Azure OpenAI', group: 'Cloud' },
  { value: 'amazon-bedrock', label: 'Amazon Bedrock', group: 'Cloud' },
  { value: 'google-vertex', label: 'Google Vertex AI', group: 'Cloud' },
];

type EndpointSaveData = {
  name: string;
  apiSpec: ApiSpec;
  baseUrl: string;
  apiKey: string;
  modelIdMapping?: Record<string, string>;
  resourceName?: string;
  apiVersion?: string;
  region?: string;
  secretKey?: string;
  awsAuthMode?: 'access-keys' | 'profile' | 'default-chain';
  awsProfileName?: string;
  projectId?: string;
  location?: string;
  googleCredentials?: string;
};

const AWS_AUTH_MODE_OPTIONS: {
  value: 'access-keys' | 'profile' | 'default-chain';
  label: string;
}[] = [
  { value: 'access-keys', label: 'Access Keys' },
  { value: 'profile', label: 'Named Profile' },
  { value: 'default-chain', label: 'Default Credential Chain' },
];

type AwsProfileInfo = {
  name: string;
  region?: string;
  ssoRegion?: string;
};

/**
 * Map an AWS region to the Bedrock cross-region inference profile
 * prefix required by Claude 4.x and Nova. Falls back to `us.` for
 * unrecognised regions because `us.` is the most broadly supported
 * family and unknown inputs almost always come from typos of a
 * US region.
 */
function bedrockInferencePrefix(region: string | undefined): string {
  if (!region) return 'us.';
  if (region.startsWith('us-') || region.startsWith('ca-')) return 'us.';
  if (region.startsWith('eu-')) return 'eu.';
  if (region.startsWith('ap-')) return 'apac.';
  return 'us.';
}

/**
 * Resolve the region the Bedrock endpoint will effectively use for
 * model-ID prefix computation. The priority matches what the backend
 * credential resolution does at signing time: explicit override wins,
 * otherwise fall back to whatever the selected profile (or env) says.
 *
 * Returns `undefined` if nothing is known — callers should treat that
 * as "prefix unknown" rather than defaulting silently.
 */
function resolveEffectiveBedrockRegion(args: {
  regionOverride: string;
  awsAuthMode: 'access-keys' | 'profile' | 'default-chain';
  awsProfileName: string;
  profiles: AwsProfileInfo[];
  envRegion: string | undefined;
}): string | undefined {
  const override = args.regionOverride.trim();
  if (override) return override;
  if (args.awsAuthMode === 'profile' && args.awsProfileName) {
    const p = args.profiles.find((x) => x.name === args.awsProfileName);
    if (p?.region) return p.region;
    if (p?.ssoRegion) return p.ssoRegion;
  }
  if (args.awsAuthMode === 'default-chain' && args.envRegion) {
    return args.envRegion;
  }
  return undefined;
}

/**
 * Build a suggested `modelIdMapping` JSON string for Bedrock, using
 * the given inference-profile prefix. The mapping covers the built-in
 * Anthropic models that Bedrock hosts; IDs are the cross-region
 * inference profile identifiers as published in Anthropic's Bedrock
 * reference (docs.anthropic.com → Models overview → Bedrock column).
 *
 * Note: the 4.6/4.7 generation uses short-form IDs without a date or
 * `-v1:0` suffix — that is intentional on Anthropic's side, not a
 * placeholder. Older models (4.5 and earlier) still carry the dated,
 * versioned form.
 */
function buildSuggestedBedrockMapping(prefix: string): string {
  const mapping: Record<string, string> = {
    'claude-opus-4.7': `${prefix}anthropic.claude-opus-4-7`,
    'claude-opus-4.6': `${prefix}anthropic.claude-opus-4-6-v1`,
    'claude-sonnet-4.6': `${prefix}anthropic.claude-sonnet-4-6`,
    'claude-haiku-4.5': `${prefix}anthropic.claude-haiku-4-5-20251001-v1:0`,
  };
  return JSON.stringify(mapping, null, 2);
}

/**
 * Bedrock-specific fields. Split out because the auth-mode switch
 * drives several conditional sub-panels (static keys, named profile
 * dropdown, default chain) that would make `ProviderSpecificFields`
 * unwieldy inline.
 *
 * Profile-list loading: fires once per mount when auth mode is
 * `profile`, and re-fires on every switch back to `profile` so a user
 * who ran `aws configure` in another terminal sees the new profile
 * without reopening the dialog. `aborted` guards against setting state
 * after the dialog closes (listAwsProfiles never rejects — it returns
 * `{ profiles: [], error }` — so we only need to care about unmount).
 */
function BedrockFields({
  endpoint,
  region,
  setRegion,
  apiKey,
  setApiKey,
  secretKey,
  setSecretKey,
  awsAuthMode,
  setAwsAuthMode,
  awsProfileName,
  setAwsProfileName,
  keyPlaceholder,
  profiles,
  profilesLoading,
  profilesError,
  envRegion,
  detectedRegion,
}: {
  endpoint?: CustomEndpoint;
  region: string;
  setRegion: (v: string) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  secretKey: string;
  setSecretKey: (v: string) => void;
  awsAuthMode: 'access-keys' | 'profile' | 'default-chain';
  setAwsAuthMode: (v: 'access-keys' | 'profile' | 'default-chain') => void;
  awsProfileName: string;
  setAwsProfileName: (v: string) => void;
  keyPlaceholder: string;
  /** Loaded by `CustomEndpointDialog` so both the dropdown and the
   *  mapping-suggest button see the same list. */
  profiles: AwsProfileInfo[];
  profilesLoading: boolean;
  profilesError: string | undefined;
  /** `AWS_REGION` / `AWS_DEFAULT_REGION` as seen by the main process. */
  envRegion: string | undefined;
  /**
   * Region computed from override → profile → env fallback chain.
   * Shown as a hint under the override input so the user can see what
   * the request will actually sign against without digging into ~/.aws.
   */
  detectedRegion: string | undefined;
}) {
  // Build the dropdown items. When the saved profile is no longer in
  // the ini files (e.g. user removed it in another tool), keep it as a
  // selectable stale entry so the form doesn't silently drop it.
  const profileItems = (() => {
    const items = profiles.map((p) => ({ value: p.name, label: p.name }));
    if (
      awsProfileName &&
      !profiles.some((p) => p.name === awsProfileName) &&
      !profilesLoading
    ) {
      items.unshift({
        value: awsProfileName,
        label: `${awsProfileName} (not found)`,
      });
    }
    return items;
  })();

  return (
    <>
      <div className="space-y-1.5">
        <p className="font-medium text-foreground text-xs">
          AWS Region{' '}
          {awsAuthMode !== 'access-keys' && (
            <span className="font-normal text-muted-foreground">
              (optional override)
            </span>
          )}
        </p>
        <Input
          placeholder={
            awsAuthMode === 'access-keys'
              ? 'us-east-1'
              : detectedRegion
                ? detectedRegion
                : 'from profile / AWS_REGION'
          }
          value={region}
          onValueChange={setRegion}
          size="sm"
        />
        {awsAuthMode !== 'access-keys' && detectedRegion && !region && (
          <p className="text-muted-foreground text-xs">
            Detected region: <code className="font-mono">{detectedRegion}</code>
            {awsAuthMode === 'default-chain' && envRegion === detectedRegion
              ? ' (from AWS_REGION)'
              : ''}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="font-medium text-foreground text-xs">
          Authentication Method
        </p>
        <Select
          value={awsAuthMode}
          onValueChange={(val) =>
            setAwsAuthMode(val as 'access-keys' | 'profile' | 'default-chain')
          }
          items={AWS_AUTH_MODE_OPTIONS}
          size="sm"
          triggerClassName="w-full"
        />
      </div>

      {awsAuthMode === 'access-keys' && (
        <>
          <div className="space-y-1.5">
            <p className="font-medium text-foreground text-xs">Access Key ID</p>
            <Input
              type="password"
              placeholder={keyPlaceholder}
              value={apiKey}
              onValueChange={setApiKey}
              size="sm"
            />
          </div>
          <div className="space-y-1.5">
            <p className="font-medium text-foreground text-xs">
              Secret Access Key
            </p>
            <Input
              type="password"
              placeholder={
                endpoint?.encryptedSecretKey
                  ? 'Leave blank to keep current key'
                  : 'Enter secret access key...'
              }
              value={secretKey}
              onValueChange={setSecretKey}
              size="sm"
            />
          </div>
        </>
      )}

      {awsAuthMode === 'profile' && (
        <div className="space-y-1.5">
          <p className="font-medium text-foreground text-xs">AWS Profile</p>
          {profileItems.length > 0 ? (
            <Select<string>
              value={awsProfileName || ''}
              onValueChange={(val) => setAwsProfileName(val ?? '')}
              items={profileItems}
              placeholder="Select a profile..."
              size="sm"
              triggerClassName="w-full"
            />
          ) : (
            <Input
              placeholder={profilesLoading ? 'Loading profiles…' : 'default'}
              value={awsProfileName}
              onValueChange={setAwsProfileName}
              size="sm"
            />
          )}
          {profilesError && (
            <p className="text-error-foreground text-xs">{profilesError}</p>
          )}
          {!profilesError && !profilesLoading && profiles.length === 0 && (
            <p className="text-muted-foreground text-xs">
              No profiles found in ~/.aws/config or ~/.aws/credentials. Type a
              name manually if needed.
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            SSO profiles require an active session. If requests fail with an
            expired-token error, run{' '}
            <code className="font-mono">
              aws sso login --profile &lt;name&gt;
            </code>{' '}
            in your terminal.
          </p>
        </div>
      )}

      {awsAuthMode === 'default-chain' && (
        <p className="text-muted-foreground text-xs">
          Credentials will be resolved from the standard AWS provider chain:
          environment variables, shared credentials file, ECS/EC2 instance
          metadata, and SSO.
        </p>
      )}
    </>
  );
}

/** Form fields that vary by provider type */
function ProviderSpecificFields({
  apiSpec,
  endpoint,
  baseUrl,
  setBaseUrl,
  apiKey,
  setApiKey,
  resourceName,
  setResourceName,
  apiVersion,
  setApiVersion,
  region,
  setRegion,
  secretKey,
  setSecretKey,
  projectId,
  setProjectId,
  location,
  setLocation,
  googleCredentials,
  setGoogleCredentials,
  awsAuthMode,
  setAwsAuthMode,
  awsProfileName,
  setAwsProfileName,
  awsProfiles,
  awsProfilesLoading,
  awsProfilesError,
  awsEnvRegion,
  bedrockDetectedRegion,
}: {
  apiSpec: ApiSpec;
  endpoint?: CustomEndpoint;
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
  resourceName: string;
  setResourceName: (v: string) => void;
  apiVersion: string;
  setApiVersion: (v: string) => void;
  region: string;
  setRegion: (v: string) => void;
  secretKey: string;
  setSecretKey: (v: string) => void;
  projectId: string;
  setProjectId: (v: string) => void;
  location: string;
  setLocation: (v: string) => void;
  googleCredentials: string;
  setGoogleCredentials: (v: string) => void;
  awsAuthMode: 'access-keys' | 'profile' | 'default-chain';
  setAwsAuthMode: (v: 'access-keys' | 'profile' | 'default-chain') => void;
  awsProfileName: string;
  setAwsProfileName: (v: string) => void;
  awsProfiles: AwsProfileInfo[];
  awsProfilesLoading: boolean;
  awsProfilesError: string | undefined;
  awsEnvRegion: string | undefined;
  bedrockDetectedRegion: string | undefined;
}) {
  const hasKey = !!endpoint?.encryptedApiKey;
  const keyPlaceholder = hasKey
    ? 'Leave blank to keep current key'
    : 'Enter API key...';

  switch (apiSpec) {
    case 'azure':
      return (
        <>
          <div className="space-y-1.5">
            <p className="font-medium text-foreground text-xs">
              Resource Name{' '}
              <span className="font-normal text-muted-foreground">
                (or use Base URL)
              </span>
            </p>
            <Input
              placeholder="my-azure-resource"
              value={resourceName}
              onValueChange={setResourceName}
              size="sm"
            />
          </div>
          <div className="space-y-1.5">
            <p className="font-medium text-foreground text-xs">
              Base URL{' '}
              <span className="font-normal text-muted-foreground">
                (overrides Resource Name)
              </span>
            </p>
            <Input
              placeholder="https://my-resource.openai.azure.com/openai"
              value={baseUrl}
              onValueChange={setBaseUrl}
              size="sm"
            />
          </div>
          <div className="space-y-1.5">
            <p className="font-medium text-foreground text-xs">API Version</p>
            <Input
              placeholder="v1"
              value={apiVersion}
              onValueChange={setApiVersion}
              size="sm"
            />
          </div>
          <div className="space-y-1.5">
            <p className="font-medium text-foreground text-xs">API Key</p>
            <Input
              type="password"
              placeholder={keyPlaceholder}
              value={apiKey}
              onValueChange={setApiKey}
              size="sm"
            />
          </div>
        </>
      );

    case 'amazon-bedrock':
      return (
        <BedrockFields
          endpoint={endpoint}
          region={region}
          setRegion={setRegion}
          apiKey={apiKey}
          setApiKey={setApiKey}
          secretKey={secretKey}
          setSecretKey={setSecretKey}
          awsAuthMode={awsAuthMode}
          setAwsAuthMode={setAwsAuthMode}
          awsProfileName={awsProfileName}
          setAwsProfileName={setAwsProfileName}
          keyPlaceholder={keyPlaceholder}
          profiles={awsProfiles}
          profilesLoading={awsProfilesLoading}
          profilesError={awsProfilesError}
          envRegion={awsEnvRegion}
          detectedRegion={bedrockDetectedRegion}
        />
      );

    case 'google-vertex':
      return (
        <>
          <div className="space-y-1.5">
            <p className="font-medium text-foreground text-xs">Project ID</p>
            <Input
              placeholder="my-gcp-project"
              value={projectId}
              onValueChange={setProjectId}
              size="sm"
            />
          </div>
          <div className="space-y-1.5">
            <p className="font-medium text-foreground text-xs">Location</p>
            <Input
              placeholder="us-central1"
              value={location}
              onValueChange={setLocation}
              size="sm"
            />
          </div>
          <div className="space-y-1.5">
            <p className="font-medium text-foreground text-xs">
              Service Account Credentials (JSON)
            </p>
            <textarea
              className="w-full rounded-lg border border-derived p-2 font-mono text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-muted-foreground/35"
              rows={4}
              placeholder={
                endpoint?.encryptedGoogleCredentials
                  ? 'Leave blank to keep current credentials'
                  : '{"type": "service_account", ...}'
              }
              value={googleCredentials}
              onChange={(e) => setGoogleCredentials(e.target.value)}
            />
          </div>
        </>
      );

    default:
      return (
        <>
          <div className="space-y-1.5">
            <p className="font-medium text-foreground text-xs">Base URL</p>
            <Input
              placeholder="https://your-endpoint.example.com/v1"
              value={baseUrl}
              onValueChange={setBaseUrl}
              size="sm"
            />
          </div>
          <div className="space-y-1.5">
            <p className="font-medium text-foreground text-xs">
              API Key{' '}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </p>
            <Input
              type="password"
              placeholder={keyPlaceholder}
              value={apiKey}
              onValueChange={setApiKey}
              size="sm"
            />
          </div>
        </>
      );
  }
}

function CustomEndpointDialog({
  endpoint,
  open,
  onOpenChange,
  onSave,
}: {
  endpoint?: CustomEndpoint;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: EndpointSaveData) => void;
}) {
  // Pages run under a different preload than the sidebar UI, so we cannot
  // import `@ui/hooks/use-track` here (it reaches for `window.electron`).
  // `useTrack` from the pages hooks routes through the pages-API
  // `captureTelemetry` bridge and swallows RPC errors so a failed capture
  // can never crash the page.
  const track = useTrack();
  // `telemetryLevel` gates whether the raw `baseUrl` is forwarded. At
  // `full` the user has consented to detailed analytics; at `basic` we
  // keep the event but redact the URL; at `off` the backend drops the
  // event entirely and this check is moot.
  const telemetryLevel = useKartonState((s) => s.globalConfig.telemetryLevel);
  const isAddMode = !endpoint;
  // Set to true when onSave() fires; distinguishes a save-initiated close
  // from a cancel/dismiss close inside the shared `handleDialogOpenChange`.
  const savedRef = useRef(false);

  const [name, setName] = useState(endpoint?.name ?? '');
  const [apiSpec, setApiSpec] = useState<ApiSpec>(
    endpoint?.apiSpec ?? 'openai-chat-completions',
  );
  const [baseUrl, setBaseUrl] = useState(endpoint?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [modelIdMappingJson, setModelIdMappingJson] = useState(
    endpoint?.modelIdMapping && Object.keys(endpoint.modelIdMapping).length > 0
      ? JSON.stringify(endpoint.modelIdMapping, null, 2)
      : '',
  );
  const [mappingError, setMappingError] = useState<string | null>(null);
  // Auto-suggestion toggle for the Bedrock model-id mapping. On by
  // default when there is no existing mapping so new Bedrock users
  // immediately get the correct cross-region inference-profile IDs
  // for their region; off for endpoints that already have a saved
  // mapping (treat it as a manual override we must not clobber).
  // User can re-enable at any time to regenerate; any manual edit to
  // the textarea flips it back off.
  const [bedrockSuggestionEnabled, setBedrockSuggestionEnabled] = useState(
    () => {
      if (endpoint?.apiSpec !== 'amazon-bedrock') return true;
      return (
        !endpoint?.modelIdMapping ||
        Object.keys(endpoint.modelIdMapping).length === 0
      );
    },
  );
  const [resourceName, setResourceName] = useState(
    endpoint?.resourceName ?? '',
  );
  const [apiVersion, setApiVersion] = useState(endpoint?.apiVersion ?? '');
  const [region, setRegion] = useState(endpoint?.region ?? '');
  const [secretKey, setSecretKey] = useState('');
  const [awsAuthMode, setAwsAuthMode] = useState<
    'access-keys' | 'profile' | 'default-chain'
  >(endpoint?.awsAuthMode ?? 'access-keys');
  const [awsProfileName, setAwsProfileName] = useState(
    endpoint?.awsProfileName ?? '',
  );
  const [projectId, setProjectId] = useState(endpoint?.projectId ?? '');
  const [location, setLocation] = useState(endpoint?.location ?? '');
  const [googleCredentials, setGoogleCredentials] = useState('');

  // Profile-list loading is lifted to the dialog so both `BedrockFields`
  // (for the dropdown + detected-region hint) and the "Suggest mapping"
  // button in the Model ID Mapping section share a single source of
  // truth. Reloading every time the user switches to `profile` covers
  // the "user ran `aws configure` in another terminal" flow without
  // forcing them to reopen the dialog.
  const listAwsProfiles = useKartonProcedure((p) => p.listAwsProfiles);
  const [awsProfiles, setAwsProfiles] = useState<AwsProfileInfo[]>([]);
  const [awsEnvRegion, setAwsEnvRegion] = useState<string | undefined>();
  const [awsProfilesError, setAwsProfilesError] = useState<
    string | undefined
  >();
  const [awsProfilesLoading, setAwsProfilesLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (apiSpec !== 'amazon-bedrock') return;
    // Access-keys mode has nothing useful to do with the profile list
    // or env region, so skip the RPC entirely.
    if (awsAuthMode === 'access-keys') return;
    let aborted = false;
    setAwsProfilesLoading(true);
    listAwsProfiles()
      .then((res) => {
        if (aborted) return;
        setAwsProfiles(res.profiles);
        setAwsEnvRegion(res.envRegion);
        setAwsProfilesError(res.error);
      })
      .catch((err: unknown) => {
        // Backend handler is try/catch'd and never rejects, but the
        // Karton RPC transport itself can fail (disconnect, serialization).
        // Without this branch `awsProfilesLoading` would stay true forever
        // and the dropdown would sit on "Loading profiles…".
        if (aborted) return;
        setAwsProfiles([]);
        setAwsEnvRegion(undefined);
        setAwsProfilesError(
          err instanceof Error ? err.message : 'Failed to load AWS profiles',
        );
      })
      .finally(() => {
        if (!aborted) setAwsProfilesLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, [open, apiSpec, awsAuthMode, listAwsProfiles]);

  const bedrockDetectedRegion = resolveEffectiveBedrockRegion({
    regionOverride: region,
    awsAuthMode,
    awsProfileName,
    profiles: awsProfiles,
    envRegion: awsEnvRegion,
  });

  // Regenerate the suggested mapping whenever anything that could
  // change the effective inference-profile prefix changes — region
  // override, selected profile (which carries its own region), or the
  // profile list loading in. We only write when the suggestion toggle
  // is on, which is off the moment the user edits the textarea
  // manually, so user overrides are never clobbered.
  useEffect(() => {
    if (!open) return;
    if (apiSpec !== 'amazon-bedrock') return;
    if (!bedrockSuggestionEnabled) return;
    const next = buildSuggestedBedrockMapping(
      bedrockInferencePrefix(bedrockDetectedRegion),
    );
    // Avoid a redundant state write (and the "field touched" side
    // effect downstream) when the mapping is already up-to-date.
    setModelIdMappingJson((prev) => (prev === next ? prev : next));
    setMappingError(null);
  }, [open, apiSpec, bedrockSuggestionEnabled, bedrockDetectedRegion]);

  // Depend ONLY on `open` so the effect runs exactly on the open/close
  // transitions. Reading `endpoint`/`isAddMode`/`track` without listing
  // them as deps is intentional — we want their values at the moment
  // the dialog opened, not whenever parent re-renders push new
  // references. Without this scoping, normal parent re-renders (e.g.
  // Karton state sync pushing a new `endpoint` array identity) would
  // silently reset the user's in-progress form input and re-emit the
  // `*-add-started` event.
  useEffect(() => {
    if (!open) return;
    setName(endpoint?.name ?? '');
    setApiSpec(endpoint?.apiSpec ?? 'openai-chat-completions');
    setBaseUrl(endpoint?.baseUrl ?? '');
    setApiKey('');
    setModelIdMappingJson(
      endpoint?.modelIdMapping &&
        Object.keys(endpoint.modelIdMapping).length > 0
        ? JSON.stringify(endpoint.modelIdMapping, null, 2)
        : '',
    );
    setMappingError(null);
    setBedrockSuggestionEnabled(
      endpoint?.apiSpec !== 'amazon-bedrock' ||
        !endpoint?.modelIdMapping ||
        Object.keys(endpoint.modelIdMapping).length === 0,
    );
    setResourceName(endpoint?.resourceName ?? '');
    setApiVersion(endpoint?.apiVersion ?? '');
    setRegion(endpoint?.region ?? '');
    setSecretKey('');
    setAwsAuthMode(endpoint?.awsAuthMode ?? 'access-keys');
    setAwsProfileName(endpoint?.awsProfileName ?? '');
    setProjectId(endpoint?.projectId ?? '');
    setLocation(endpoint?.location ?? '');
    setGoogleCredentials('');
    savedRef.current = false;
    if (isAddMode) {
      // No payload on `started` — `api_spec` at this point is always the
      // default and carries no signal. It's only meaningful on `finished`
      // (and `aborted`, to understand what spec the user was partway
      // through configuring).
      track('custom-provider-add-started');
    }
  }, [open]);

  // Bedrock profile auth requires a non-empty profile name — without it the
  // backend's buildBedrockProvider() throws at call time. Block save here so
  // a whitespace-only value can't produce a backend-invalid endpoint.
  const bedrockProfileInvalid =
    apiSpec === 'amazon-bedrock' &&
    awsAuthMode === 'profile' &&
    awsProfileName.trim().length === 0;

  const canSave =
    name.trim().length > 0 && !mappingError && !bedrockProfileInvalid;

  // "Touched" = the user changed anything from the initial field values.
  // Derived from current state so we don't need per-input bookkeeping.
  // Secret-ish fields (apiKey, secretKey, googleCredentials) start empty in
  // edit-mode by design; any non-empty value is a touch.
  const anyFieldTouched =
    name !== (endpoint?.name ?? '') ||
    apiSpec !== (endpoint?.apiSpec ?? 'openai-chat-completions') ||
    baseUrl !== (endpoint?.baseUrl ?? '') ||
    apiKey !== '' ||
    modelIdMappingJson !==
      (endpoint?.modelIdMapping &&
      Object.keys(endpoint.modelIdMapping).length > 0
        ? JSON.stringify(endpoint.modelIdMapping, null, 2)
        : '') ||
    resourceName !== (endpoint?.resourceName ?? '') ||
    apiVersion !== (endpoint?.apiVersion ?? '') ||
    region !== (endpoint?.region ?? '') ||
    secretKey !== '' ||
    awsAuthMode !== (endpoint?.awsAuthMode ?? 'access-keys') ||
    awsProfileName !== (endpoint?.awsProfileName ?? '') ||
    projectId !== (endpoint?.projectId ?? '') ||
    location !== (endpoint?.location ?? '') ||
    googleCredentials !== '';

  // A pristine, unmodified form is NOT an error — an empty required
  // `name` field at initial state means "not filled in yet", not
  // "validation failed". `had_validation_errors` should only be true when
  // the user entered input that triggered a concrete validation rule
  // (currently: invalid JSON in the model-id mapping).
  const hadValidationErrors = mappingError !== null;

  /**
   * Build the provider-URL-related telemetry properties for the current
   * form state. Keeps the three add-* events consistent:
   *
   * - `api_spec` always present — coarse selector useful for funnel splits.
   * - `is_local` present only when a `baseUrl` was entered (so absence
   *   distinguishes "empty field" from "non-local URL").
   * - `base_url` present only when telemetry is set to `full` AND the
   *   field is non-empty; we do not transmit URLs on `basic`.
   */
  const buildUrlProps = (): {
    api_spec: string;
    is_local?: boolean;
    base_url?: string;
    aws_auth_mode?: 'access-keys' | 'profile' | 'default-chain';
  } => {
    // Coarse Bedrock auth-mode tag. Never include the profile name —
    // it's redacted by policy (see telemetry event schema).
    const bedrockProps =
      apiSpec === 'amazon-bedrock' ? { aws_auth_mode: awsAuthMode } : {};
    const trimmed = baseUrl.trim();
    if (!trimmed) return { api_spec: apiSpec, ...bedrockProps };
    let isLocal: boolean | undefined;
    try {
      const host = new URL(trimmed).hostname;
      isLocal = host === 'localhost' || host === '127.0.0.1';
    } catch {
      isLocal = undefined;
    }
    return {
      api_spec: apiSpec,
      ...(isLocal !== undefined && { is_local: isLocal }),
      ...(telemetryLevel === 'full' && { base_url: trimmed }),
      ...bedrockProps,
    };
  };

  const handleDialogOpenChange = (next: boolean) => {
    if (!next && open && isAddMode && !savedRef.current) {
      track('custom-provider-add-aborted', {
        had_validation_errors: hadValidationErrors,
        any_field_touched: anyFieldTouched,
        ...buildUrlProps(),
      });
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogClose />
        <DialogHeader>
          <DialogTitle>
            {endpoint ? 'Edit Provider' : 'Add Custom Provider'}
          </DialogTitle>
          <DialogDescription>
            Configure a custom API endpoint for LLM services.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="font-medium text-foreground text-xs">Name</p>
            <Input
              placeholder="My Azure OpenAI"
              value={name}
              onValueChange={setName}
              size="sm"
            />
          </div>

          <div className="space-y-1.5">
            <p className="font-medium text-foreground text-xs">Provider Type</p>
            <Select
              value={apiSpec}
              onValueChange={(val) => setApiSpec(val as ApiSpec)}
              items={API_SPEC_OPTIONS}
              size="sm"
              triggerClassName="w-full"
            />
          </div>

          <ProviderSpecificFields
            apiSpec={apiSpec}
            endpoint={endpoint}
            baseUrl={baseUrl}
            setBaseUrl={setBaseUrl}
            apiKey={apiKey}
            setApiKey={setApiKey}
            resourceName={resourceName}
            setResourceName={setResourceName}
            apiVersion={apiVersion}
            setApiVersion={setApiVersion}
            region={region}
            setRegion={setRegion}
            secretKey={secretKey}
            setSecretKey={setSecretKey}
            projectId={projectId}
            setProjectId={setProjectId}
            location={location}
            setLocation={setLocation}
            googleCredentials={googleCredentials}
            setGoogleCredentials={setGoogleCredentials}
            awsAuthMode={awsAuthMode}
            setAwsAuthMode={setAwsAuthMode}
            awsProfileName={awsProfileName}
            setAwsProfileName={setAwsProfileName}
            awsProfiles={awsProfiles}
            awsProfilesLoading={awsProfilesLoading}
            awsProfilesError={awsProfilesError}
            awsEnvRegion={awsEnvRegion}
            bedrockDetectedRegion={bedrockDetectedRegion}
          />

          <div className="space-y-1.5 border-derived border-t pt-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-foreground text-xs">
                Model ID Mapping{' '}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </p>
              {apiSpec === 'amazon-bedrock' && (
                // Bedrock-only shortcut: Claude/Nova on Bedrock require
                // cross-region inference-profile IDs (prefixed `us.`,
                // `eu.`, `apac.`) rather than the bare Anthropic IDs. A
                // toggle (rather than one-shot button) keeps the textarea
                // in sync when region-affecting settings change, so users
                // switching profile/region mid-config get the correct
                // prefix without having to notice and re-click. Toggle is
                // flipped off on any manual edit below to preserve user
                // overrides.
                <Tooltip>
                  <TooltipTrigger delay={300}>
                    <span
                      className="flex cursor-pointer select-none items-center gap-1.5 text-muted-foreground text-xs"
                      onClick={() => setBedrockSuggestionEnabled((v) => !v)}
                    >
                      <Switch
                        size="xs"
                        checked={bedrockSuggestionEnabled}
                        onCheckedChange={(checked) =>
                          setBedrockSuggestionEnabled(checked)
                        }
                        onClick={(e) => e.stopPropagation()}
                      />
                      Suggested mapping
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="end">
                    <p className="max-w-xs text-xs leading-relaxed">
                      Map the built-in Claude models to the matching Bedrock
                      cross-region inference profiles for your region. Turn off
                      to edit the mapping manually.
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <p className="text-muted-foreground text-xs">
              Map built-in model IDs to the IDs this endpoint expects, e.g. when
              the provider uses different naming.
            </p>
            <textarea
              className="scrollbar-subtle w-full resize-y rounded-lg border border-derived p-2 font-mono text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-muted-foreground/35"
              rows={8}
              placeholder='{"claude-opus-4.7": "anthropic.claude-opus-4-7"}'
              value={modelIdMappingJson}
              onChange={(e) => {
                setModelIdMappingJson(e.target.value);
                setMappingError(null);
                // Any manual edit means the user has taken over;
                // stop auto-regenerating so the effect above cannot
                // overwrite their changes when region/profile shifts.
                if (bedrockSuggestionEnabled) {
                  setBedrockSuggestionEnabled(false);
                }
              }}
            />
            {mappingError && (
              <p className="text-error-foreground text-xs">{mappingError}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="primary"
            size="sm"
            disabled={!canSave}
            onClick={() => {
              let modelIdMapping: Record<string, string> | undefined;
              if (modelIdMappingJson.trim()) {
                try {
                  modelIdMapping = JSON.parse(modelIdMappingJson);
                } catch {
                  setMappingError('Invalid JSON');
                  return;
                }
              }
              onSave({
                name: name.trim(),
                apiSpec,
                baseUrl,
                apiKey,
                modelIdMapping,
                resourceName: resourceName || undefined,
                apiVersion: apiVersion || undefined,
                region: region || undefined,
                secretKey: secretKey || undefined,
                awsAuthMode:
                  apiSpec === 'amazon-bedrock' ? awsAuthMode : undefined,
                awsProfileName:
                  apiSpec === 'amazon-bedrock' && awsAuthMode === 'profile'
                    ? awsProfileName.trim() || undefined
                    : undefined,
                projectId: projectId || undefined,
                location: location || undefined,
                googleCredentials: googleCredentials || undefined,
              });
              if (isAddMode) {
                track('custom-provider-add-finished', buildUrlProps());
              }
              savedRef.current = true;
              onOpenChange(false);
            }}
          >
            {endpoint ? 'Save Changes' : 'Add Provider'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDialogOpenChange(false)}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomEndpointCard({
  endpoint,
  onEdit,
  onDelete,
}: {
  endpoint: CustomEndpoint;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const specLabel =
    API_SPEC_OPTIONS.find((o) => o.value === endpoint.apiSpec)?.label ??
    endpoint.apiSpec;

  const bedrockModeLabel =
    endpoint.apiSpec === 'amazon-bedrock'
      ? endpoint.awsAuthMode === 'profile'
        ? `profile:${endpoint.awsProfileName || '?'}`
        : endpoint.awsAuthMode === 'default-chain'
          ? 'default chain'
          : 'access keys'
      : null;

  // Mode-aware region label. Only access-keys auth has a hard-coded
  // `us-east-1` backend fallback, so only that mode can truthfully
  // show it. For profile / default-chain the region is resolved at
  // call time from the profile file or the environment, so we show
  // the *source* instead of inventing a region.
  const bedrockRegionLabel =
    endpoint.apiSpec === 'amazon-bedrock'
      ? endpoint.region
        ? endpoint.region
        : endpoint.awsAuthMode === 'profile'
          ? 'from profile'
          : endpoint.awsAuthMode === 'default-chain'
            ? 'from environment'
            : 'us-east-1'
      : null;

  const subtitle =
    endpoint.apiSpec === 'amazon-bedrock'
      ? `${specLabel} \u00b7 ${bedrockModeLabel} \u00b7 ${bedrockRegionLabel}`
      : endpoint.apiSpec === 'google-vertex'
        ? `${specLabel} \u00b7 ${endpoint.projectId || 'no project'} \u00b7 ${endpoint.location || 'us-central1'}`
        : endpoint.apiSpec === 'azure'
          ? `${specLabel} \u00b7 ${endpoint.resourceName || endpoint.baseUrl || 'not configured'}`
          : `${specLabel} \u00b7 ${endpoint.baseUrl || 'No URL set'}`;

  return (
    <div className="flex items-start justify-between gap-2 rounded-lg border border-derived p-4">
      <div className="min-w-0 flex-1">
        <h3 className="font-medium text-foreground text-sm">{endpoint.name}</h3>
        <p className="truncate text-muted-foreground text-xs">{subtitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon-sm" onClick={onEdit}>
          <IconPenOutline18 className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDelete}>
          <IconTrashOutline18 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function CustomEndpointsSection() {
  const preferences = useKartonState((s) => s.preferences);
  const updatePreferences = useKartonProcedure((s) => s.updatePreferences);
  const setCustomEndpointApiKey = useKartonProcedure(
    (s) => s.setCustomEndpointApiKey,
  );
  const setCustomEndpointSecretKey = useKartonProcedure(
    (s) => s.setCustomEndpointSecretKey,
  );
  const setCustomEndpointGoogleCredentials = useKartonProcedure(
    (s) => s.setCustomEndpointGoogleCredentials,
  );

  const endpoints = preferences?.customEndpoints ?? [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<
    CustomEndpoint | undefined
  >(undefined);

  const handleAdd = useCallback(() => {
    setEditingEndpoint(undefined);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((ep: CustomEndpoint) => {
    setEditingEndpoint(ep);
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback(
    async (data: EndpointSaveData) => {
      if (editingEndpoint) {
        const idx = endpoints.findIndex((ep) => ep.id === editingEndpoint.id);
        if (idx === -1) return;
        const [, patches] = produceWithPatches(preferences, (draft) => {
          const ep = draft.customEndpoints[idx]!;
          ep.name = data.name;
          ep.apiSpec = data.apiSpec;
          ep.baseUrl = data.baseUrl;
          ep.modelIdMapping = data.modelIdMapping;
          ep.resourceName = data.resourceName;
          ep.apiVersion = data.apiVersion;
          ep.region = data.region;
          // Only Bedrock reads `awsAuthMode` / `awsProfileName`. Touching
          // the fields for other apiSpecs would silently pollute saved
          // state; leave them alone so Zod defaults + prior Bedrock state
          // never leak across apiSpec switches.
          if (data.apiSpec === 'amazon-bedrock') {
            ep.awsAuthMode = data.awsAuthMode ?? 'access-keys';
            ep.awsProfileName = data.awsProfileName;
          }
          ep.projectId = data.projectId;
          ep.location = data.location;
        });
        await updatePreferences(patches);

        if (data.apiKey) {
          await setCustomEndpointApiKey(editingEndpoint.id, data.apiKey);
        }
        if (data.secretKey) {
          await setCustomEndpointSecretKey(editingEndpoint.id, data.secretKey);
        }
        if (data.googleCredentials) {
          await setCustomEndpointGoogleCredentials(
            editingEndpoint.id,
            data.googleCredentials,
          );
        }
      } else {
        const id = crypto.randomUUID();
        const [, patches] = produceWithPatches(preferences, (draft) => {
          draft.customEndpoints.push({
            id,
            name: data.name,
            apiSpec: data.apiSpec,
            baseUrl: data.baseUrl,
            modelIdMapping: data.modelIdMapping,
            resourceName: data.resourceName,
            apiVersion: data.apiVersion,
            region: data.region,
            // `awsAuthMode` is schema-required, so we always set a value.
            // For non-Bedrock specs we pin it to the schema default so the
            // field is inert (not surfaced in the UI, ignored at the call
            // site) and `awsProfileName` is left undefined.
            awsAuthMode:
              data.apiSpec === 'amazon-bedrock'
                ? (data.awsAuthMode ?? 'access-keys')
                : 'access-keys',
            awsProfileName:
              data.apiSpec === 'amazon-bedrock'
                ? data.awsProfileName
                : undefined,
            projectId: data.projectId,
            location: data.location,
          });
        });
        await updatePreferences(patches);

        if (data.apiKey) {
          await setCustomEndpointApiKey(id, data.apiKey);
        }
        if (data.secretKey) {
          await setCustomEndpointSecretKey(id, data.secretKey);
        }
        if (data.googleCredentials) {
          await setCustomEndpointGoogleCredentials(id, data.googleCredentials);
        }
      }
    },
    [
      editingEndpoint,
      endpoints,
      preferences,
      updatePreferences,
      setCustomEndpointApiKey,
      setCustomEndpointSecretKey,
      setCustomEndpointGoogleCredentials,
    ],
  );

  const customModels = preferences?.customModels ?? [];

  const handleDelete = useCallback(
    async (endpointId: string) => {
      const affectedModels = customModels.filter(
        (m) => m.endpointId === endpointId,
      );
      if (affectedModels.length > 0) {
        const names = affectedModels.map((m) => m.displayName).join(', ');
        const confirmed = window.confirm(
          `The following custom models use this provider and will stop working:\n\n${names}\n\nDelete anyway?`,
        );
        if (!confirmed) return;
      }

      const [, patches] = produceWithPatches(preferences, (draft) => {
        const idx = draft.customEndpoints.findIndex(
          (ep) => ep.id === endpointId,
        );
        if (idx !== -1) {
          draft.customEndpoints.splice(idx, 1);
        }
      });
      await updatePreferences(patches);
    },
    [preferences, updatePreferences, customModels],
  );

  return (
    <div className="space-y-3">
      {endpoints.length === 0 ? (
        <div className="rounded-lg border border-derived-subtle p-4">
          <p className="text-center text-muted-foreground text-sm">
            No custom providers configured yet.
          </p>
        </div>
      ) : (
        endpoints.map((ep) => (
          <CustomEndpointCard
            key={ep.id}
            endpoint={ep}
            onEdit={() => handleEdit(ep)}
            onDelete={() => handleDelete(ep.id)}
          />
        ))
      )}

      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={handleAdd}>
          <IconPlusOutline18 className="size-3.5" />
          Add Provider
        </Button>
      </div>

      <CustomEndpointDialog
        endpoint={editingEndpoint}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
      />
    </div>
  );
}

// =============================================================================
// Page Component
// =============================================================================

function Page() {
  const navigate = useNavigate();

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex items-center border-border-subtle border-b px-6 py-4">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate({ to: '/agent-settings/models-providers' })}
          >
            <IconChevronLeftOutline18 className="size-4" />
          </Button>
          <div className="flex flex-col">
            <h1 className="font-semibold text-foreground text-xl">
              Custom Providers
            </h1>
            <span className="text-muted-foreground text-sm">
              Add custom API endpoints for self-hosted or third-party LLM
              services.
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <OverlayScrollbar className="flex-1" contentClassName="px-6 pt-6 pb-24">
        <div className="mx-auto max-w-3xl">
          <CustomEndpointsSection />
        </div>
      </OverlayScrollbar>
    </div>
  );
}
