import type { KartonContract } from '@shared/karton-contracts/ui';

export type WorkspacePlugin = NonNullable<
  NonNullable<KartonContract['state']['workspace']>['plugins']
>[number];
