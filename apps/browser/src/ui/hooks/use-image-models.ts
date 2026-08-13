import {
  canUseImageModels,
  getSelectableImageModelEntries,
} from '@shared/available-image-models';
import type { ProviderInstance } from '@shared/karton-contracts/ui/shared-types';
import { useEffect, useMemo } from 'react';
import { useKartonProcedure, useKartonState } from './use-karton';

const pendingRefreshes = new Set<string>();

export function useEnsureImageModels(
  instances: readonly ProviderInstance[],
): void {
  const refreshModels = useKartonProcedure(
    (procedures) => procedures.preferences.refreshInstanceModels,
  );

  useEffect(() => {
    for (const instance of instances) {
      if (
        !canUseImageModels(instance) ||
        instance.imageModels !== undefined ||
        pendingRefreshes.has(instance.id)
      ) {
        continue;
      }
      pendingRefreshes.add(instance.id);
      void refreshModels(instance.id)
        .catch(() => undefined)
        .finally(() => pendingRefreshes.delete(instance.id));
    }
  }, [instances, refreshModels]);
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
