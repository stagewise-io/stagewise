import {
  canUseImageModels,
  getSelectableImageModelEntries,
} from '@shared/available-image-models';
import type { ProviderInstance } from '@shared/karton-contracts/ui/shared-types';
import { useEffect, useMemo, useState } from 'react';
import { useKartonProcedure, useKartonState } from './use-karton';

const IMAGE_MODEL_RETRY_DELAY_MS = 5_000;
const pendingRefreshes = new Map<string, Promise<void>>();
const latestRefreshKeys = new Map<string, string>();

function refreshWithRetry(
  key: string,
  isCurrent: () => boolean,
  refresh: () => Promise<unknown>,
): Promise<void> {
  const pending = pendingRefreshes.get(key);
  if (pending) return pending;

  const next = refresh()
    .catch(async () => {
      await new Promise((resolve) =>
        setTimeout(resolve, IMAGE_MODEL_RETRY_DELAY_MS),
      );
      if (!isCurrent()) return;
      await refresh();
    })
    .then(() => undefined)
    .finally(() => pendingRefreshes.delete(key));
  pendingRefreshes.set(key, next);
  return next;
}

export function useEnsureImageModels(
  instances: readonly ProviderInstance[],
): ReadonlySet<string> {
  const refreshImageModels = useKartonProcedure(
    (procedures) => procedures.preferences.refreshInstanceImageModels,
  );
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  useEffect(() => {
    let cancelled = false;
    for (const instance of instances) {
      if (!canUseImageModels(instance) || instance.imageModels !== undefined) {
        continue;
      }
      const refreshKey = `${instance.id}\u001f${instance.typeId}\u001f${JSON.stringify(instance.config)}`;
      latestRefreshKeys.set(instance.id, refreshKey);
      setFailedIds((current) => {
        if (!current.has(instance.id)) return current;
        const next = new Set(current);
        next.delete(instance.id);
        return next;
      });
      void refreshWithRetry(
        refreshKey,
        () => latestRefreshKeys.get(instance.id) === refreshKey,
        () => refreshImageModels(instance.id),
      ).catch(() => {
        if (cancelled) return;
        setFailedIds((current) => new Set(current).add(instance.id));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [instances, refreshImageModels]);
  return failedIds;
}

export function useImageModelEntries() {
  const providerInstances = useKartonState(
    (state) => state.preferences.providerInstances,
  );
  useEnsureImageModels(providerInstances);
  return useMemo(
    () => getSelectableImageModelEntries(providerInstances),
    [providerInstances],
  );
}
