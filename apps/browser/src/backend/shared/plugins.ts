import type { KartonContract } from '@stagewise/karton-contract';

export type WorkspacePlugin = NonNullable<
  NonNullable<KartonContract['state']['workspace']>['plugins']
>[number];
