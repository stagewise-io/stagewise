import {
  canUseImageModels,
  getSelectableImageModelEntries,
} from '@shared/available-image-models';
import type { ProviderInstance } from '@shared/karton-contracts/ui/shared-types';
import { useEffect, useMemo, useState } from 'react';
import { useKartonProcedure, useKartonState } from './use-karton';

export function useEnsureImageModels(
  instances: readonly ProviderInstance[],
): ReadonlySet<string> {
  const refreshImageModels = useKartonProcedure(
    (procedures) => procedures.preferences.refreshInstanceImageModels,
  );
  const [retry, setRetry] = useState(false);
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    for (const instance of instances) {
      if (!canUseImageModels(instance) || instance.imageModels !== undefined) {
        continue;
      }
      void refreshImageModels(instance.id).catch(() => {
        if (!cancelled && !retry) {
          retryTimer ??= setTimeout(() => setRetry(true), 5_000);
        } else if (!cancelled) {
          setFailedIds((current) => new Set(current).add(instance.id));
        }
      });
    }
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [instances, refreshImageModels, retry]);
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
