import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { useKartonState, useKartonProcedure } from '@pages/hooks/use-karton';
import { useEffect, useState, useCallback } from 'react';
import type {
  ApiSpec,
  CustomEndpoint,
} from '@shared/karton-contracts/ui/shared-types';
import { Input } from '@stagewise/stage-ui/components/input';
import { Button } from '@stagewise/stage-ui/components/button';
import { Select } from '@stagewise/stage-ui/components/select';
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
  projectId?: string;
  location?: string;
  googleCredentials?: string;
};

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
        <>
          <div className="space-y-1.5">
            <p className="font-medium text-foreground text-xs">AWS Region</p>
            <Input
              placeholder="us-east-1"
              value={region}
              onValueChange={setRegion}
              size="sm"
            />
          </div>
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
  const [resourceName, setResourceName] = useState(
    endpoint?.resourceName ?? '',
  );
  const [apiVersion, setApiVersion] = useState(endpoint?.apiVersion ?? '');
  const [region, setRegion] = useState(endpoint?.region ?? '');
  const [secretKey, setSecretKey] = useState('');
  const [projectId, setProjectId] = useState(endpoint?.projectId ?? '');
  const [location, setLocation] = useState(endpoint?.location ?? '');
  const [googleCredentials, setGoogleCredentials] = useState('');

  useEffect(() => {
    if (open) {
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
      setResourceName(endpoint?.resourceName ?? '');
      setApiVersion(endpoint?.apiVersion ?? '');
      setRegion(endpoint?.region ?? '');
      setSecretKey('');
      setProjectId(endpoint?.projectId ?? '');
      setLocation(endpoint?.location ?? '');
      setGoogleCredentials('');
    }
  }, [open, endpoint]);

  const canSave = name.trim().length > 0 && !mappingError;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          />

          <div className="space-y-1.5 border-derived border-t pt-3">
            <p className="font-medium text-foreground text-xs">
              Model ID Mapping{' '}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </p>
            <p className="text-muted-foreground text-xs">
              Map built-in model IDs to the IDs this endpoint expects, e.g. when
              the provider uses different naming.
            </p>
            <textarea
              className="w-full rounded-lg border border-derived p-2 font-mono text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-muted-foreground/35"
              rows={3}
              placeholder='{"claude-opus-4-6": "claude-3-opus-20240229"}'
              value={modelIdMappingJson}
              onChange={(e) => {
                setModelIdMappingJson(e.target.value);
                setMappingError(null);
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
                projectId: projectId || undefined,
                location: location || undefined,
                googleCredentials: googleCredentials || undefined,
              });
              onOpenChange(false);
            }}
          >
            {endpoint ? 'Save Changes' : 'Add Provider'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
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

  const subtitle =
    endpoint.apiSpec === 'amazon-bedrock'
      ? `${specLabel} \u00b7 ${endpoint.region || 'us-east-1'}`
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
