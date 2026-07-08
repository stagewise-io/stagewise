import { Button } from '@stagewise/stage-ui/components/button';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import { useState, useCallback, useRef } from 'react';
import { useScrollFadeMask } from '@ui/hooks/use-scroll-fade-mask';
import { produceWithPatches, enablePatches } from 'immer';

import {
  IconPlusOutline18,
  IconChevronLeftOutline18,
} from 'nucleo-ui-outline-18';
import type { CustomEndpoint } from '@shared/karton-contracts/ui/shared-types';
import {
  CustomEndpointForm,
  CustomEndpointCard,
  type CustomEndpointFormHandle,
  type EndpointSaveData,
} from '@ui/screens/settings/sections/custom-providers-section';
import { BackButton, NextButton, OnboardingBottomNav } from '../index';

enablePatches();

export function StepCustomEndpoints({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const preferences = useKartonState((s) => s.preferences);
  const updatePreferences = useKartonProcedure((p) => p.preferences.update);
  const setCustomEndpointApiKey = useKartonProcedure(
    (p) => p.preferences.setCustomEndpointApiKey,
  );
  const setCustomEndpointSecretKey = useKartonProcedure(
    (p) => p.preferences.setCustomEndpointSecretKey,
  );
  const setCustomEndpointGoogleCredentials = useKartonProcedure(
    (p) => p.preferences.setCustomEndpointGoogleCredentials,
  );

  const endpoints = preferences?.customEndpoints ?? [];

  // Sub-view state: when formOpen is true, show the add/edit form.
  // editingEndpoint is undefined for add mode, set for edit mode.
  const [editingEndpoint, setEditingEndpoint] = useState<
    CustomEndpoint | undefined
  >(undefined);
  const [formOpen, setFormOpen] = useState(false);

  // Scroll fade mask for main list
  const [contentViewport, setContentViewport] = useState<HTMLElement | null>(
    null,
  );
  const contentScrollRef = useRef<HTMLElement | null>(null);
  contentScrollRef.current = contentViewport;
  const { maskStyle: contentMaskStyle } = useScrollFadeMask(contentScrollRef, {
    axis: 'vertical',
    fadeDistance: 24,
  });

  const handleAdd = useCallback(() => {
    setEditingEndpoint(undefined);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((ep: CustomEndpoint) => {
    setEditingEndpoint(ep);
    setFormOpen(true);
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
      setFormOpen(false);
      setEditingEndpoint(undefined);
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

  const formRef = useRef<CustomEndpointFormHandle>(null);

  // Closes the form sub-view. Called by the form's onCancel (which
  // is invoked after the form fires its own abort telemetry).
  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditingEndpoint(undefined);
  }, []);

  // Back button: route through the form's cancel so the rich abort
  // telemetry (validation errors, touched state, URL props) fires,
  // then closeForm runs via the form's onCancel callback.
  const handleBack = useCallback(() => {
    formRef.current?.cancel();
  }, []);

  const handleDelete = useCallback(
    async (endpointId: string) => {
      const [, patches] = produceWithPatches(preferences, (draft) => {
        const idx = draft.customEndpoints.findIndex(
          (ep) => ep.id === endpointId,
        );
        if (idx !== -1) {
          draft.customEndpoints.splice(idx, 1);
        }
        // Cascade: remove any custom models that referenced the deleted
        // endpoint, leaving dangling references that would fail at
        // resolution time.
        draft.customModels = draft.customModels.filter(
          (m) => m.endpointId !== endpointId,
        );
      });
      await updatePreferences(patches);
    },
    [preferences, updatePreferences],
  );

  // ─── Sub-view: Add / Edit form ───────────────────────────────────
  if (formOpen) {
    return (
      <div className="app-no-drag flex flex-1 flex-col items-center overflow-hidden">
        <OverlayScrollbar
          className="w-full max-w-md flex-1"
          contentClassName="flex flex-col gap-4 px-8 pt-8 pb-8"
        >
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" onClick={handleBack}>
              <IconChevronLeftOutline18 className="size-4" />
            </Button>
            <h2 className="font-medium text-foreground text-sm">
              {editingEndpoint ? 'Edit Provider' : 'Add Custom Provider'}
            </h2>
          </div>
          <CustomEndpointForm
            ref={formRef}
            endpoint={editingEndpoint}
            open={formOpen}
            onSave={handleSave}
            onCancel={closeForm}
            showFooterDivider={false}
          />
        </OverlayScrollbar>
      </div>
    );
  }

  // ─── Main view: endpoint list ────────────────────────────────────
  const canProceed = endpoints.length > 0;

  return (
    <>
      <div className="app-no-drag flex flex-1 flex-col items-center gap-4 overflow-hidden pt-8">
        <div className="flex shrink-0 flex-col items-center gap-2 px-8 text-center">
          <h1 className="font-medium text-foreground text-xl">
            Custom Endpoints
          </h1>
          <p className="max-w-md text-muted-foreground text-sm">
            Add custom API endpoints for self-hosted or third-party LLM
            services.
          </p>
        </div>

        <OverlayScrollbar
          className="mask-alpha w-full max-w-lg flex-1"
          style={contentMaskStyle}
          onViewportRef={setContentViewport}
          contentClassName="flex flex-col gap-3 px-8 pb-4 pt-4"
        >
          {endpoints.length === 0 ? (
            <div className="rounded-lg border border-derived-subtle p-6">
              <p className="text-center text-muted-foreground text-sm">
                No custom endpoints configured yet. Add one to get started.
              </p>
            </div>
          ) : (
            endpoints.map((ep) => (
              <CustomEndpointCard
                key={ep.id}
                endpoint={ep}
                onEdit={() => handleEdit(ep)}
                onDelete={() => void handleDelete(ep.id)}
              />
            ))
          )}

          <div className="flex justify-center pt-1">
            <Button variant="secondary" size="sm" onClick={handleAdd}>
              <IconPlusOutline18 className="size-3.5" />
              Add Endpoint
            </Button>
          </div>
        </OverlayScrollbar>
      </div>
      <OnboardingBottomNav
        left={<BackButton onClick={onBack} />}
        right={
          <NextButton onClick={onNext} label={canProceed ? 'Next' : 'Skip'} />
        }
      />
    </>
  );
}
