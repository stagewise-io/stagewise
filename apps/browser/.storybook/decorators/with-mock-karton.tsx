import type { Decorator } from '@storybook/react';
import { MockKartonProvider } from '../mocks/mock-hooks';
import type { AppState } from '@shared/karton-contracts/ui';

/**
 * Storybook decorator that provides mock Karton state to components.
 *
 * Usage in stories:
 * ```tsx
 * export default {
 *   decorators: [withMockKarton],
 *   parameters: {
 *     mockKartonState: {
 *       workspace: { ... }
 *     }
 *   }
 * }
 * ```
 */
export const withMockKarton: Decorator = (Story, context) => {
  const mockState = context.parameters.mockKartonState as
    | Partial<AppState>
    | undefined;

  return (
    <MockKartonProvider mockState={mockState}>
      <Story />
    </MockKartonProvider>
  );
};
